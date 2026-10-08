"""Prepare Andenne Bears helmet derivatives from existing Commons artwork."""

from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "images" / "wiki"
OUT.mkdir(parents=True, exist_ok=True)
USER_AGENT = "Mozilla/5.0 (compatible; AndenneBearsWikipediaArt/1.0; mailto:contact@andenne-bears.be)"


def download(filename: str) -> bytes:
    url = f"https://commons.wikimedia.org/wiki/Special:Redirect/file/{filename}"
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request) as response:
        return response.read()


# CC0 source by Simanek: https://commons.wikimedia.org/wiki/File:FootballHelmet.svg
svg = download("FootballHelmet.svg").decode("utf-8")
replacements = {
    '<stop id="stop3840" style="stop-color:#ffffff" offset="0"/>': '<stop id="stop3840" style="stop-color:#343434" offset="0"/>',
    '<stop id="stop3842" style="stop-color:#cbcbcb" offset="1"/>': '<stop id="stop3842" style="stop-color:#050505" offset="1"/>',
    'style="stroke:#a7a7a7;fill:url(#radialGradient3836)"': 'style="stroke:#050505;fill:url(#radialGradient3836)"',
    'id="path3790" style="fill:#e00701"': 'id="path3790" style="fill:#161616"',
    '<title id="title3904">Football Helmet</title>': '<title id="title3904">Casque noir à grille rouge — Andenne Bears</title>',
}
for before, after in replacements.items():
    if svg.count(before) != 1:
        raise ValueError(f"Unexpected SVG source: {before}")
    svg = svg.replace(before, after, 1)
(OUT / "Andenne_Bears_casque_noir_grille_rouge.svg").write_text(svg, encoding="utf-8")


# CC BY-SA 3.0 source by Rolando, as restored by Equiquinos:
# https://commons.wikimedia.org/wiki/File:Kit_helmet_af.png
kit = Image.open(BytesIO(download("Kit_helmet_af.png"))).convert("RGBA")
if kit.size != (100, 31):
    raise ValueError(f"Unexpected kit size: {kit.size}")
pixels = list(kit.get_flattened_data())
for y in range(16, 31):
    for x in range(54, 69):
        index = y * kit.width + x
        r, g, b, a = pixels[index]
        if a > 0 and max(r, g, b) < 225 and abs(r - g) < 8 and abs(g - b) < 8:
            brightness = max(0.35, r / 190)
            pixels[index] = (round(208 * brightness), round(10 * brightness), round(24 * brightness), a)
kit.putdata(pixels)
kit.save(OUT / "Kit_helmet_af_Andenne_Bears.png")


# Assemble a local preview from the same Commons kit parts used by the
# French Wikipedia "Uniforme de football américain" template.
names = {
    "home_left": "Kit left arm af steelers.png",
    "home_right": "Kit right arm af steelers.png",
    "plain_left": "Kit left arm af.png",
    "plain_right": "Kit right arm af.png",
    "body": "Kit body.png",
    "trousers": "Kit trousers long yellowsides.png",
    "socks": "Kit socks af.png",
}
query = urlencode({
    "action": "query",
    "titles": "|".join("File:" + name for name in names.values()),
    "prop": "imageinfo",
    "iiprop": "url",
    "format": "json",
})
request = Request("https://commons.wikimedia.org/w/api.php?" + query,
                  headers={"User-Agent": USER_AGENT})
with urlopen(request) as response:
    pages = json.load(response)["query"]["pages"].values()
urls = {page["title"][5:].replace("_", " ").lower(): page["imageinfo"][0]["url"]
        for page in pages}
parts = {}
for key, name in names.items():
    part_request = Request(urls[name.lower()],
                           headers={"User-Agent": USER_AGENT})
    with urlopen(part_request) as response:
        parts[key] = Image.open(BytesIO(response.read())).convert("RGBA")


def panel(part: Image.Image, color: str) -> Image.Image:
    background = Image.new("RGBA", part.size, color)
    background.alpha_composite(part)
    return background


def uniform(home: bool) -> Image.Image:
    image = Image.new("RGBA", (100, 190), "white")
    image.paste(panel(kit, "black"), (0, 0))
    shirt_color = "black" if home else "#ffcc00"
    left = parts["home_left" if home else "plain_left"]
    right = parts["home_right" if home else "plain_right"]
    image.paste(panel(left, shirt_color), (0, 31))
    image.paste(panel(parts["body"], shirt_color), (31, 31))
    image.paste(panel(right, shirt_color), (69, 31))
    image.paste(panel(parts["trousers"], "black"), (0, 90))
    image.paste(panel(parts["socks"], "black"), (0, 170))
    return image


preview = Image.new("RGB", (760, 690), "white")
for x, is_home in ((55, True), (405, False)):
    preview.paste(uniform(is_home).resize((300, 570), Image.Resampling.NEAREST), (x, 45))
draw = ImageDraw.Draw(preview)
font_path = Path("C:/Windows/Fonts/arialbd.ttf")
font = ImageFont.truetype(str(font_path), 25) if font_path.exists() else ImageFont.load_default()
draw.text((130, 625), "Domicile", fill="black", font=font)
draw.text((480, 625), "Extérieur", fill="black", font=font)
preview.save(OUT / "Andenne_Bears_tenues_actuelles-apercu.png")
