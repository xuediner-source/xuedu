import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import { Dialog, setDialogDefaultOptions } from 'vant'
import 'vant/lib/index.css'
import './assets/main.css'
import './assets/widget.css'

setDialogDefaultOptions({
  transition: 'none',
  overlayStyle: { background: 'rgba(0, 0, 0, 0.38)' }
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(Dialog)
app.mount('#app')
