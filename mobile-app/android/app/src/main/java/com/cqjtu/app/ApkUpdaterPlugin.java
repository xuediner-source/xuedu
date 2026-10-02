package com.cqjtu.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final int BUFFER_SIZE = 16 * 1024;

    private volatile boolean downloading = false;
    private File pendingApk;

    @PluginMethod
    public void getInfo(PluginCall call) {
        call.resolve(buildAppInfo());
    }

    @PluginMethod
    public void startDownload(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }
        if (downloading) {
            call.resolve();
            return;
        }
        downloading = true;
        call.resolve();

        new Thread(() -> {
            try {
                File apk = null;
                try {
                    apk = downloadToCache(url.trim());
                } catch (Exception primaryEx) {
                    if (url.contains("xuediner.xyz")) {
                        String fallbackUrl = url.replace("https://xuediner.xyz", "http://47.109.150.102")
                                                .replace("http://xuediner.xyz", "http://47.109.150.102");
                        apk = downloadToCache(fallbackUrl.trim());
                    } else {
                        throw primaryEx;
                    }
                }
                pendingApk = apk;
                if (!canInstallPackages()) {
                    JSObject data = new JSObject();
                    data.put("message", "请允许安装未知应用，返回后将自动继续");
                    emit("needPermission", data);
                    openUnknownSourcesSettings();
                    return;
                }
                emit("installing", null);
                launchInstaller(apk);
                pendingApk = null;
                emit("complete", null);
            } catch (Exception e) {
                JSObject err = new JSObject();
                err.put("message", e.getMessage() != null ? e.getMessage() : "下载失败");
                emit("error", err);
            } finally {
                downloading = false;
            }
        }, "apk-download").start();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        emit("appResume", buildAppInfo());
        final File apk = pendingApk;
        if (apk == null || !apk.exists() || !canInstallPackages()) {
            return;
        }
        runOnUi(() -> {
            try {
                launchInstaller(apk);
                pendingApk = null;
                emit("installing", null);
                emit("complete", null);
            } catch (Exception e) {
                JSObject err = new JSObject();
                err.put("message", e.getMessage() != null ? e.getMessage() : "无法打开安装器");
                emit("error", err);
            }
        });
    }

    private File getDownloadFile() {
        File dir = getContext().getExternalCacheDir();
        if (dir == null) {
            dir = getContext().getCacheDir();
        }
        return new File(dir, "cqjtu-update.apk");
    }

    private File downloadToCache(String urlString) throws Exception {
        File outFile = getDownloadFile();
        try {
            if (outFile.exists()) {
                outFile.delete();
            }
        } catch (Exception ignored) {}

        HttpURLConnection conn = openConnection(urlString);
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            conn.disconnect();
            throw new Exception("下载失败（HTTP " + code + "）");
        }

        long total = conn.getContentLength();
        if (Build.VERSION.SDK_INT >= 24) {
            total = conn.getContentLengthLong();
        }
        InputStream in = conn.getInputStream();
        FileOutputStream out = new FileOutputStream(outFile);
        byte[] buf = new byte[BUFFER_SIZE];
        long received = 0;
        long lastEmit = 0;
        try {
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                received += n;
                long now = System.currentTimeMillis();
                if (now - lastEmit >= 120) {
                    emitProgress(received, total);
                    lastEmit = now;
                }
            }
            out.flush();
        } finally {
            try { out.close(); } catch (Exception ignored) {}
            try { in.close(); } catch (Exception ignored) {}
            conn.disconnect();
        }

        if (received <= 0) {
            throw new Exception("安装包为空");
        }
        emitProgress(received, total > 0 ? total : received);
        return outFile;
    }

    private HttpURLConnection openConnection(String urlString) throws Exception {
        URL url = new URL(urlString);
        int redirects = 0;
        while (redirects < 5) {
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
            conn.setRequestProperty("Accept-Encoding", "identity");
            conn.setRequestProperty("Accept", "application/vnd.android.package-archive, */*");
            conn.setRequestProperty("Connection", "keep-alive");
            conn.connect();
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                    || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == HttpURLConnection.HTTP_SEE_OTHER
                    || code == 307
                    || code == 308) {
                String next = conn.getHeaderField("Location");
                conn.disconnect();
                if (next == null || next.isEmpty()) {
                    throw new Exception("下载重定向无效");
                }
                url = new URL(url, next);
                redirects++;
                continue;
            }
            return conn;
        }
        throw new Exception("下载重定向过多");
    }

    private void openUnknownSourcesSettings() {
        runOnUi(() -> {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            settings.setData(Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
        });
    }

    private void launchInstaller(File apk) throws Exception {
        android.content.Context context = getContext();
        Uri apkUri = FileProvider.getUriForFile(
            context,
            context.getPackageName() + ".fileprovider",
            apk
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            java.util.List<android.content.pm.ResolveInfo> resolveInfoList = context.getPackageManager()
                .queryIntentActivities(intent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
            for (android.content.pm.ResolveInfo resolveInfo : resolveInfoList) {
                String packageName = resolveInfo.activityInfo.packageName;
                context.grantUriPermission(packageName, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
        } catch (Exception ignored) {}

        Activity activity = getActivity();
        if (activity != null) {
            activity.startActivity(intent);
        } else {
            context.startActivity(intent);
        }
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private JSObject buildAppInfo() {
        JSObject info = new JSObject();
        String versionName = "";
        long versionCode = 0;
        try {
            android.content.pm.PackageInfo pkg = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            versionName = pkg.versionName != null ? pkg.versionName : "";
            if (Build.VERSION.SDK_INT >= 28) {
                versionCode = pkg.getLongVersionCode();
            } else {
                versionCode = pkg.versionCode;
            }
        } catch (Exception ignored) {}
        info.put("versionName", versionName);
        info.put("versionCode", versionCode);
        return info;
    }

    private void emitProgress(long received, long total) {
        JSObject p = new JSObject();
        p.put("received", received);
        p.put("total", total);
        int percent = total > 0 ? (int) Math.min(100, (received * 100) / total) : 0;
        p.put("percent", percent);
        emit("progress", p);
    }

    private void emit(String event, JSObject data) {
        final JSObject payload = data != null ? data : new JSObject();
        runOnUi(() -> notifyListeners(event, payload));
    }

    private void runOnUi(Runnable r) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(r);
        } else {
            r.run();
        }
    }
}
