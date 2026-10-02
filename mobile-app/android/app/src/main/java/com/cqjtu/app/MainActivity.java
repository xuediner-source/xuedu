package com.cqjtu.app;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        // 默认 WebView 底是白的，页面还没画出来 / 半透明层合成失败时会闪整屏白框
        getWindow().getDecorView().setBackgroundColor(Color.parseColor("#ECEEE6"));
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.setBackgroundColor(Color.parseColor("#ECEEE6"));
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        }
    }
}
