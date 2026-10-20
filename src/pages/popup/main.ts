import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import '@/styles/tokens.css'
import '@/styles/base.css'
import { directives } from '@/directives'

createApp(App).use(createPinia()).use(directives).mount('#app')
