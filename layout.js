/* layout.js — one layout profile per ratio (section 5.9).
   All numbers are in Full HD BASE pixels. The 4K output is the same page rendered at
   device scale factor 2, the HD output is scaled down by FFmpeg.
   scenes.js reads ONLY these values — it never hard-codes a frame size.

   Profile fields
     w, h        frame size
     safe        minimum side margin for the header row / final scene
     header      stacked: icon {size,y}, name {size,y = centre line}, pill {h,y = top,font}
                 row    : one centred row {y,h,icon,gap}, name {size}, pill {h,font}
     card        {x,y,w,h}                 badge  circle diameter
     text        {size, lh}                (line-height in px at that size)
     wave        {cy = centre y, max, min, bar = bar width, pitch}
     progress    {y,h}
     final       {top} = y of the app icon in the final scene (null = centred as a group)
*/
const LAYOUTS = {
  '9x16': {
    key: '9x16', w: 1080, h: 1920, safe: 50,
    header: {
      mode: 'stacked',
      icon: { size: 190, y: 110 },
      name: { size: 54, y: 358 },
      pill: { h: 80, y: 408, font: 36 }
    },
    card: { x: 70, y: 640, w: 940, h: 760 },
    badge: 84,
    text: { size: 76, lh: 112 },
    wave: { cy: 1580, max: 154, min: 30, bar: 14, pitch: 26 },
    progress: { y: 1910, h: 10 },
    final: { top: 610 }
  },

  '4x5': {
    key: '4x5', w: 1080, h: 1350, safe: 50,
    header: {
      mode: 'stacked',
      icon: { size: 130, y: 40 },
      name: { size: 44, y: 212 },
      pill: { h: 56, y: 246, font: 30 }
    },
    card: { x: 60, y: 360, w: 960, h: 680 },
    badge: 72,
    text: { size: 66, lh: 98 },
    wave: { cy: 1140, max: 120, min: 23, bar: 14, pitch: 26 },
    progress: { y: 1340, h: 10 },
    final: { top: null }
  },

  '3x4': {
    key: '3x4', w: 1080, h: 1440, safe: 50,
    header: {
      mode: 'stacked',
      icon: { size: 150, y: 44 },
      name: { size: 46, y: 236 },
      pill: { h: 60, y: 272, font: 32 }
    },
    card: { x: 60, y: 390, w: 960, h: 720 },
    badge: 76,
    text: { size: 68, lh: 102 },
    wave: { cy: 1235, max: 130, min: 25, bar: 14, pitch: 26 },
    progress: { y: 1430, h: 10 },
    final: { top: null }
  },

  '1x1': {
    key: '1x1', w: 1080, h: 1080, safe: 50,
    header: {
      mode: 'stacked',
      icon: { size: 104, y: 26 },
      name: { size: 40, y: 164 },
      pill: { h: 50, y: 194, font: 28 }
    },
    card: { x: 60, y: 280, w: 960, h: 520 },
    badge: 64,
    text: { size: 54, lh: 80 },
    wave: { cy: 900, max: 110, min: 21, bar: 14, pitch: 26 },
    progress: { y: 1070, h: 10 },
    final: { top: null }
  },

  '16x9': {
    key: '16x9', w: 1920, h: 1080, safe: 80,
    header: {
      mode: 'row',
      row: { y: 28, h: 96, icon: 96, gap: 28 },
      name: { size: 44 },
      pill: { h: 52, font: 28 }
    },
    card: { x: 160, y: 170, w: 1600, h: 620 },
    badge: 68,
    text: { size: 64, lh: 96 },
    wave: { cy: 900, max: 130, min: 25, bar: 16, pitch: 30 },
    progress: { y: 1070, h: 10 },
    final: { top: null }
  },

  '4x3': {
    key: '4x3', w: 1440, h: 1080, safe: 50,
    header: {
      mode: 'row',
      row: { y: 28, h: 96, icon: 96, gap: 28 },
      name: { size: 40 },
      pill: { h: 50, font: 26 }
    },
    card: { x: 100, y: 170, w: 1240, h: 600 },
    badge: 68,
    text: { size: 60, lh: 90 },
    wave: { cy: 885, max: 130, min: 25, bar: 16, pitch: 30 },
    progress: { y: 1070, h: 10 },
    final: { top: null }
  }
};
