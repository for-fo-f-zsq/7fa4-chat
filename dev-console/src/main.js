import { createApp } from 'vue'
// Font Awesome 7 Free：**自托管**（字体随构建产物一起打包，零 CDN）。
// 源码来自客户端仓库的 src/renderer/css/font-awesome（同一份 7.3.1），
// 以保证后台与客户端图标观感一致。webfonts 的相对路径由 Vite 自动重写为哈希资源。
import './vendor/fontawesome/css/all.min.css'
import './styles.css'
import App from './App.vue'

createApp(App).mount('#app')
