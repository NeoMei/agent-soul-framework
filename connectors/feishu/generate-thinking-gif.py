"""Generate a thinking-indicator GIF with icon, name, and animated dots."""
from PIL import Image, ImageDraw, ImageFont
import math, sys, os

BOT_NAME = sys.argv[1] if len(sys.argv) > 1 else '点点'
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else 'thinking.gif'

FONT_SIZE = 16
DOT_R = 3
FRAMES = 12
FPS = 10

# Layout: [icon] [name + "思考中"] [dots]
# Use system font
try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', FONT_SIZE)
except Exception:
    FONT = ImageFont.load_default()

# Measure text width
dummy = Image.new('RGBA', (1, 1))
draw = ImageDraw.Draw(dummy)
# Use a small icon character or draw a circle
icon_w = 24
text_str = f'{BOT_NAME}思考中'
text_bbox = draw.textbbox((0, 0), text_str, font=FONT)
text_w = text_bbox[2] - text_bbox[0]
text_h = text_bbox[3] - text_bbox[1]
dots_w = 24  # space for animated dots

W = icon_w + text_w + dots_w + 4
H = max(24, text_h + 12)

print(f'Generating {W}x{H} GIF for "{text_str}"')

# Soft colors
DOT_COLOR = (140, 140, 210)
TEXT_COLOR = (80, 80, 120)
ICON_COLOR = (160, 160, 220)

frames = []
for i in range(FRAMES):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw icon: a small rounded circle pulsing
    pulse = (math.sin(i / FRAMES * 2 * math.pi) + 1) / 2  # 0..1
    r = 7 + int(pulse * 3)
    cx, cy = 12, H // 2
    alpha = int(180 + pulse * 75)
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill=(160, 160, 220, alpha),
    )

    # Draw text
    tx = icon_w + 2
    ty = (H - text_h) // 2
    draw.text((tx, ty), text_str, fill=TEXT_COLOR, font=FONT)

    # Draw animated dots
    dx = icon_w + text_w + 6
    dy = H // 2
    for dot in range(3):
        phase = (i - dot * 4) % FRAMES
        offset_y = int(math.sin(phase / FRAMES * 2 * math.pi) * 4)
        alpha_dot = int(120 + math.sin(phase / FRAMES * 2 * math.pi + math.pi / 2) * 135)
        dot_y = dy + offset_y
        dot_x = dx + dot * 8
        draw.ellipse(
            [dot_x - DOT_R, dot_y - DOT_R, dot_x + DOT_R, dot_y + DOT_R],
            fill=(140, 140, 210, alpha_dot),
        )

    frames.append(img)

frames[0].save(
    OUTPUT,
    save_all=True,
    append_images=frames[1:],
    duration=int(1000 / FPS),
    loop=0,
    transparency=0,
    disposal=2,
)
print(f'Created {OUTPUT} ({W}x{H}, {FRAMES} frames @ {FPS}fps)')
