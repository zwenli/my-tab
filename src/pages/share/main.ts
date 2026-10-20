import { createApp } from 'vue'
import App from './App.vue'
import '@/styles/tokens.css'
import '@/styles/base.css'
import { directives } from '@/directives'

createApp(App).use(directives).mount('#app')
