"""Geographic parking plan from a frozen OpenStreetMap extract; see sources file."""
from math import cos, radians, hypot
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'images/family-day-parking-evelette-2026.jpg'
W,H=1600,2000
MX,MY,MW,MH=64,290,1472,1120
NORTH,WEST,SCALE=50.41715,5.1622,1.46
INK,GOLD,BLUE,RED='#16242c','#f5ca37','#145476','#b73936'
def font(size,bold=False):
 return ImageFont.truetype('C:/Windows/Fonts/'+('segoeuib.ttf' if bold else 'segoeui.ttf'),size)
def xy(lat,lon):
 return ((lon-WEST)*111320*cos(radians(50.414))*SCALE,(NORTH-lat)*111320*SCALE)
root=ET.parse(ROOT/'design/family-parking-osm.xml').getroot()
nodes={n.attrib['id']:(float(n.attrib['lat']),float(n.attrib['lon'])) for n in root.findall('node')}
ways=[]
for w in root.findall('way'):
 tags={t.attrib['k']:t.attrib['v'] for t in w.findall('tag')}
 pts=[xy(*nodes[n.attrib['ref']]) for n in w.findall('nd')]
 ways.append((w.attrib['id'],tags,pts))
canvas=Image.new('RGB',(W,H),'#f8f8f3');d=ImageDraw.Draw(canvas)
d.rectangle((0,0,W,247),fill=INK);d.rectangle((64,48,76,195),fill=GOLD)
d.text((101,42),'ANDENNE BEARS  /  JOURNÉE FAMILIALE',font=font(29,True),fill=GOLD)
d.text((98,85),'Où se garer à Évelette ?',font=font(66,True),fill='white')
d.text((103,172),'DIMANCHE 25 OCTOBRE 2026',font=font(32,True),fill='white')
d.text((64,255),'3 lieux indiqués par les organisateurs',font=font(24),fill=INK)
m=Image.new('RGB',(MW,MH),'#eaf0e3');md=ImageDraw.Draw(m)
# Genuine geographic land cover and building footprints.
for wid,t,p in ways:
 fill=None
 if t.get('landuse') in ('farmland','farmyard'): fill='#e7e8d8'
 if t.get('landuse') in ('meadow','grass','village_green'): fill='#dce8cf'
 if t.get('natural') in ('wood','scrub') or t.get('landuse')=='forest': fill='#c2d5b4'
 if t.get('landuse')=='residential': fill='#f1f0e9'
 if t.get('landuse')=='cemetery': fill='#dae3d0'
 if t.get('leisure')=='pitch': fill='#b4d4b4'
 if t.get('amenity')=='parking': fill='#cbdde5'
 if fill and len(p)>2: md.polygon(p,fill=fill)
for wid,t,p in ways:
 if 'building' in t: md.polygon(p,fill='#d1d0c9',outline='#bcbdb6')
 if 'waterway' in t: md.line(p,fill='#a8cbd3',width=3)
roads=[(wid,t,p) for wid,t,p in ways if 'highway' in t and t.get('area')!='yes']
widths={'secondary':22,'tertiary':18,'unclassified':15,'residential':15,'service':8,'track':5,'footway':3,'path':3}
for border in (True,False):
 for wid,t,p in roads:
  width=widths.get(t['highway'],5)
  color='#c3c7bb' if border else ('#f9eac0' if t['highway']=='secondary' else '#ffffff')
  md.line(p,fill=color,width=width+(4 if border else 0),joint='curve')
for wid,t,p in roads:
 if wid=='99579828':
  md.line(p,fill='#f6d0ca',width=28,joint='curve');md.line(p,fill=RED,width=7,joint='curve')

# Confirmed by the organizer: Rue du Tige, on the football-field side.
# Distances follow the OSM road centerline. Dimensions are assumptions, not
# surveyed parking bays: 4.5 x 1.9 m, 1 m longitudinal gap, 4.25 m lateral offset.
CAR_LENGTH, CAR_WIDTH, CAR_GAP = 4.5, 1.9, 1.0
TIGE = list(reversed(next(p for wid,t,p in ways if wid=='238574046')))

def along_road(distance_m):
 remaining = distance_m*SCALE
 for a,b in zip(TIGE,TIGE[1:]):
  dx,dy=b[0]-a[0],b[1]-a[1];length=hypot(dx,dy)
  if remaining <= length:
   ux,uy=dx/length,dy/length
   return (a[0]+ux*remaining,a[1]+uy*remaining),(ux,uy)
  remaining-=length
 raise ValueError('Position outside the confirmed road section')

car_positions=[]
for i in range(7):
 point,direction=along_road(18+i*(CAR_LENGTH+CAR_GAP))
 ux,uy=direction
 center=(point[0]+uy*4.25*SCALE,point[1]-ux*4.25*SCALE)
 car_positions.append((center,direction))

def draw_parking(target,origin=(0,0),zoom=1):
 # Supersample vector car footprints so the small overview remains clean.
 ss=4;layer=Image.new('RGBA',(target.width*ss,target.height*ss));ld=ImageDraw.Draw(layer)
 factor=zoom*ss
 def transform(p): return ((p[0]-origin[0])*factor,(p[1]-origin[1])*factor)
 band=[]
 for distance in (15,24,36,48,54):
  p,(ux,uy)=along_road(distance)
  band.append(transform((p[0]+uy*4.25*SCALE,p[1]-ux*4.25*SCALE)))
 ld.line(band,fill='#83c5d1',width=round(3.4*SCALE*factor),joint='curve')
 for center,(ux,uy) in car_positions:
  def local(length,width):
   return transform((center[0]+(ux*length+uy*width)*SCALE,center[1]+(uy*length-ux*width)*SCALE))
  # The footprint remains exactly 4.5 x 1.9 m, including its rounded corners.
  body=[(-2.25,-.55),(-1.9,-.95),(1.8,-.95),(2.25,-.55),(2.25,.55),(1.8,.95),(-1.9,.95),(-2.25,.55)]
  ld.polygon([local(a,b) for a,b in body],fill='#164968')
  for lo,hi in [(-1.25,-.65),(.7,1.35)]:
   ld.polygon([local(lo,-.7),local(hi,-.64),local(hi,.64),local(lo,.7)],fill='#bde4ef')
  ld.line([local(2.0,-.60),local(2.0,.60)],fill='#fff2bf',width=max(1,round(.15*SCALE*factor)))
 overlay=layer.resize(target.size,Image.Resampling.LANCZOS)
 target.paste(overlay,(0,0),overlay)

# The inset is a geographically registered enlargement of the same base map.
draw_parking(m)
def label(text,lat,lon,size=25,angle=0,color='#536251'):
 f=font(size,True);box=f.getbbox(text);im=Image.new('RGBA',(box[2]+16,box[3]-box[1]+16))
 dd=ImageDraw.Draw(im);dd.text((8,8-box[1]),text,font=f,fill=color,stroke_width=4,stroke_fill='#f8f8f0')
 im=im.rotate(angle,expand=True,resample=Image.Resampling.BICUBIC)
 x,y=xy(lat,lon);m.paste(im,(round(x-im.width/2),round(y-im.height/2)),im)
label('Rue Saint-Donat',50.41612,5.1666,23,78)
label('Rue du Tige',50.41402,5.1690,26,-52)
label('Route de Sorée',50.4119,5.1695,24,-18)
label('N983',50.4123,5.1676,25,-67)
label('Rue du Baty',50.41075,5.1749,21,65)
label('Rue des Sorbiers',50.4125,5.1752,21,27)
label('École',50.41072,5.17548,22)
label('ÉVELETTE',50.4121,5.1739,27,color='#7b8877')
pitch=next(p for wid,t,p in ways if wid=='99579819');md.line(pitch,fill='#71956e',width=3,joint='curve')
cx=sum(x for x,y in pitch[:-1])/4;cy=sum(y for x,y in pitch[:-1])/4
md.text((cx,cy),'TERRAIN',anchor='mm',font=font(20,True),fill='#3d6640')
def parking_pin(number,lat,lon):
 x,y=xy(lat,lon)
 md.ellipse((x-8,y-8,x+8,y+8),fill=BLUE,outline='white',width=3);md.line((x,y,x,y-30),fill=BLUE,width=4)
 md.rounded_rectangle((x-42,y-103,x+42,y-27),radius=18,fill=BLUE,outline='white',width=5)
 md.text((x,y-66),'P'+str(number),anchor='mm',font=font(34,True),fill='white')
 return x,y
p1=parking_pin(1,50.41560,5.16748);p2=parking_pin(2,50.41313,5.17010);p3=parking_pin(3,50.41140,5.17354)
def callout(text,sub,box,point):
 x,y,w,h=box;px,py=point;edge=x+w if px>x+w else x
 md.line((edge,y+h/2,px,py-42),fill=BLUE,width=3)
 md.rounded_rectangle((x,y,x+w,y+h),radius=12,fill='#ffffff',outline='#c2d0ce',width=2)
 md.text((x+20,y+12),text,font=font(29,True),fill=INK);md.text((x+20,y+53),sub,font=font(23),fill='#526066')
callout('Terrain de foot','Parking et abords',(45,324,370,100),p1)
callout('Maison des Jeunes','Parking de la MJ',(900,585,450,100),p2)
callout('Place de convivialité','À côté de l’école',(610,960,430,100),p3)
rx,ry=xy(50.4159,5.17038);md.line((rx,ry,1000,225),fill=RED,width=3)
md.rounded_rectangle((1000,150,1425,256),radius=12,fill='#fff5f2',outline=RED,width=2)
md.text((1020,164),'Rue des Comognes',font=font(27,True),fill=RED);md.text((1020,207),'Ne pas stationner',font=font(24,True),fill=RED)
md.rounded_rectangle((28,26,97,140),radius=16,fill='white');md.text((62,42),'N',anchor='mt',font=font(25,True),fill=INK)
md.polygon([(62,82),(48,118),(62,109),(76,118)],fill=INK)
md.rounded_rectangle((28,MH-95,250,MH-25),radius=12,fill='white');md.line((55,MH-48,55+100*SCALE,MH-48),fill=INK,width=5)
md.line((55,MH-55,55,MH-41),fill=INK,width=3);md.line((55+100*SCALE,MH-55,55+100*SCALE,MH-41),fill=INK,width=3)
md.text((55,MH-85),'100 m',font=font(24),fill=INK)

# Local detail keeps cars readable without enlarging them on the main map.
ZX,ZY,ZW,ZH=29,525,480,425
ZOOM=4
center=car_positions[3][0]
crop=(round(center[0]-56),round(center[1]-35),round(center[0]+56),round(center[1]+35))
def render_detail(origin,zoom):
 # Re-render vectors, rather than enlarging low-resolution pixels.
 ss=4;f=zoom*ss
 result=Image.new('RGB',(448*ss,280*ss),'#eaf0e3');rd=ImageDraw.Draw(result)
 def points(p): return [((x-origin[0])*f,(y-origin[1])*f) for x,y in p]
 for wid,t,p in ways:
  fill=None
  if t.get('landuse') in ('farmland','farmyard'): fill='#e7e8d8'
  if t.get('landuse') in ('meadow','grass','village_green'): fill='#dce8cf'
  if t.get('landuse')=='residential': fill='#f1f0e9'
  if t.get('leisure')=='pitch': fill='#b4d4b4'
  if fill and len(p)>2: rd.polygon(points(p),fill=fill)
 for wid,t,p in ways:
  if 'building' in t: rd.polygon(points(p),fill='#d1d0c9',outline='#bcbdb6')
 for border in (True,False):
  for wid,t,p in roads:
   width=widths.get(t['highway'],5)
   color='#c3c7bb' if border else ('#f9eac0' if t['highway']=='secondary' else '#ffffff')
   rd.line(points(p),fill=color,width=round((width+(4 if border else 0))*f),joint='curve')
 return result.resize((448,280),Image.Resampling.LANCZOS)
detail=render_detail(crop[:2],ZOOM)
draw_parking(detail,origin=crop[:2],zoom=ZOOM)
md.rounded_rectangle((ZX,ZY,ZX+ZW,ZY+ZH),radius=16,fill='white',outline=BLUE,width=2)
md.text((ZX+20,ZY+13),'Détail P1 · rue du Tige',font=font(26,True),fill=BLUE)
md.text((ZX+20,ZY+51),'Stationnement côté terrain',font=font(22,True),fill=INK)
m.paste(detail,(ZX+16,ZY+86))
md=ImageDraw.Draw(m)
md.rounded_rectangle((ZX+29,ZY+103,ZX+133,ZY+164),radius=7,fill='white')
md.text((ZX+42,ZY+105),'10 m',font=font(20,True),fill=INK)
md.line((ZX+42,ZY+146,ZX+42+10*SCALE*ZOOM,ZY+146),fill=INK,width=4)
md.line((ZX+42,ZY+140,ZX+42,ZY+152),fill=INK,width=3)
md.line((ZX+42+10*SCALE*ZOOM,ZY+140,ZX+42+10*SCALE*ZOOM,ZY+152),fill=INK,width=3)
md.text((ZX+20,ZY+371),'Voitures : 4,5 × 1,9 m · écart : 1 m',font=font(21),fill=INK)
md.text((ZX+20,ZY+400),'Simulation indicative, sans capacité garantie.',font=font(18),fill='#536168')
canvas.paste(m,(MX,MY));d.rounded_rectangle((MX,MY,MX+MW,MY+MH),radius=5,outline='#ccd3c7',width=2)
entries=[('1','Terrain de foot','Parking et abords, dont rue du Tige côté terrain.'),('2','Maison des Jeunes','Parking de la MJ · rue du Tige, 26.'),('3','Place de convivialité','Près de l’école · rue du Baty.')]
for i,(n,title,subtitle) in enumerate(entries):
 y=1442+i*105;d.rounded_rectangle((64,y+5,133,y+74),radius=14,fill=BLUE)
 d.text((99,y+38),n,anchor='mm',font=font(35,True),fill='white');d.text((158,y),title,font=font(34,True),fill=INK)
 d.text((158,y+46),subtitle,font=font(27),fill='#4c5b62')
d.rounded_rectangle((64,1772,1536,1880),radius=16,fill='#f7e3df');d.ellipse((86,1794,146,1854),outline=RED,width=6)
d.line((96,1844,136,1804),fill=RED,width=6)
d.text((169,1786),'Pas de stationnement rue des Comognes.',font=font(34,True),fill='#952f2c')
d.text((169,1835),'Gardez les accès libres et respectez les panneaux sur place.',font=font(26),fill='#6a3f38')
d.text((64,1907),'Repères indicatifs · stationnez selon les places disponibles.',font=font(24),fill='#536168')
d.text((64,1947),'Fond : © contributeurs OpenStreetMap · openstreetmap.org/copyright',font=font(22),fill='#536168')
d.text((1536,1947),'andenne-bears.be',anchor='ra',font=font(22,True),fill=INK)
canvas.save(OUTPUT,'JPEG',quality=94,optimize=True,progressive=True,subsampling=0)
print(f'{OUTPUT}: {W} x {H}')
