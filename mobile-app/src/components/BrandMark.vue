<template>
  <svg class="brand-mark" :width="size" :height="size" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M2 18V2h16M46 2h16v16M62 46v16H46M18 62H2V46" stroke="currentColor" stroke-width="1.2" opacity=".45" />
    <path d="M13 15h12l14 34h12M51 15H39L25 49H13" stroke="currentColor" stroke-width="4" stroke-linecap="square" />
    <path d="M16 32h32" stroke="currentColor" stroke-width="1.2" />
    <rect x="28" y="28" width="8" height="8" fill="var(--accent-hot, #D77338)" />
  </svg>
</template>
<script setup>
defineProps({ size: { type: Number, default: 44 } })
</script>
<style scoped>.brand-mark { color: var(--text-primary, #262D24); flex-shrink: 0; }</style>
