<template>
  <div class="archive-sculpture" aria-hidden="true">
    <svg viewBox="0 0 240 220" fill="none">
      <path d="M15 174H225M120 12V207" stroke="currentColor" opacity=".12" stroke-dasharray="2 5" />
      <ellipse cx="122" cy="176" rx="79" ry="19" fill="currentColor" opacity=".05" />
      <g class="sculpture-base">
        <path d="M35 118 132 64 212 111 114 169Z" fill="#D9D8D1" stroke="#A6AAA4" />
        <path d="M35 118v10l79 47v-6Zm79 51 98-58v10l-98 54Z" fill="#C5C7BF" stroke="#A6AAA4" />
      </g>
      <g class="sculpture-sheet sheet-middle">
        <path d="M35 96 132 42 212 89 114 147Z" fill="#F4F4EF" fill-opacity=".94" stroke="#B5B9B0" />
        <path d="m64 97 69-38 52 30-70 40Z" stroke="#CBCFC6" />
        <path d="m90 88 42-23 31 18-42 24Z" stroke="#737F71" stroke-width="4" />
        <path d="m97 111 43-25 19 11" stroke="#D97639" stroke-width="4" />
        <path d="m57 100 10 6m97-39 12 7m-61 61 12-7" stroke="#9A9F96" />
      </g>
      <g class="sculpture-sheet sheet-top">
        <path d="M35 73 132 19 212 66 114 124Z" fill="#FFFFFF" fill-opacity=".67" stroke="#959F92" />
        <path d="M35 73v4l79 47v-4" stroke="#FFFFFF" stroke-width="2" />
        <path d="m47 72 84-47 69 40" stroke="#FFFFFF" stroke-width="2" />
        <path d="m70 76 52-29 40 23-51 30Z" stroke="#7B8877" stroke-width="1.4" />
        <path d="m89 77 45-25m-16 39 27-15" stroke="#82917C" stroke-width="5" />
        <path d="m145 54 14-8 12 7-14 8Z" fill="#DD793C" />
        <circle cx="48" cy="73" r="2" fill="#8F978B" />
        <circle cx="197" cy="66" r="2" fill="#8F978B" />
        <path d="m115 114 15-9m-10 12 15-9m-10 12 15-9" stroke="#A5ABA1" />
      </g>
      <path d="m179 130 21 13h23M37 48H17v19" stroke="#929C8D" stroke-width=".8" />
      <rect x="219" y="140" width="5" height="5" fill="#DD793C" />
      <text x="20" y="199" fill="#737C6E" font-size="8" font-family="monospace" letter-spacing="2">XUEDU / ACADEMIC</text>
    </svg>
  </div>
</template>

<style scoped>
.archive-sculpture { color: #626F5D; pointer-events: none; }
svg { display: block; width: 100%; height: auto; overflow: visible; }
.sculpture-sheet { transform-origin: 120px 110px; animation: archiveAssemble 900ms var(--ease-xd) both; }
.sheet-middle { animation-duration: 700ms; }
@keyframes archiveAssemble { from { transform: translateY(-16px); } to { transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .sculpture-sheet { animation: none; } }
</style>
