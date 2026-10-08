"""Virtual layout check for the five absolutely positioned burger hats."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
STAGES = (30, 60, 100, 150, 200)
HAT_WIDTH = {30: 101, 60: 112, 100: 118, 150: 122, 200: 128}
HAT_RIGHT = {30: 14, 60: 6, 100: 3, 150: 0, 200: -2}
HAT_BOTTOM = {30: .78, 60: .77, 100: .78, 150: .78, 200: .75}
PORTRAIT = Image.open(ROOT / 'images/family-burgers-president-2026.png').convert('RGBA')
FONT = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 25)
SMALL = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)


def tile(stage):
    canvas = Image.new('RGBA', (280, 400), '#fafaf8')
    portrait = PORTRAIT.resize((144, round(PORTRAIT.height * 144 / PORTRAIT.width)), Image.Resampling.LANCZOS)
    panel_x, panel_y = 40, 205
    face_x = panel_x + 200 - portrait.width
    face_y = panel_y + 68 - portrait.height
    canvas.alpha_composite(portrait, (face_x, face_y))
    hat = Image.open(ROOT / f'images/family-burger-hat-{stage}-2026.webp').convert('RGBA')
    hat = hat.resize((HAT_WIDTH[stage], round(hat.height * HAT_WIDTH[stage] / hat.width)), Image.Resampling.LANCZOS)
    hat_x = face_x + portrait.width - HAT_RIGHT[stage] - hat.width
    hat_y = round(face_y + portrait.height * (1 - HAT_BOTTOM[stage]) - hat.height)
    canvas.alpha_composite(hat, (hat_x, hat_y))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((panel_x + 4, panel_y + 5, panel_x + 204, panel_y + 155), fill='#111')
    draw.rectangle((panel_x, panel_y, panel_x + 199, panel_y + 149), fill='#f6d52d', outline='#9a1732', width=4)
    draw.text((panel_x + 16, panel_y + 30), str(stage), font=FONT, fill='#111')
    draw.text((panel_x + 16, panel_y + 77), 'Burgers', font=SMALL, fill='#111')
    draw.text((panel_x + 16, panel_y + 102), 'réservés', font=SMALL, fill='#111')
    return canvas


sheet = Image.new('RGB', (280 * 5, 400), '#fafaf8')
for index, stage in enumerate(STAGES):
    sheet.paste(tile(stage), (index * 280, 0))
sheet.save(ROOT / 'design/family-burger-milestones-preview.png')
