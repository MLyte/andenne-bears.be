export function schedule(settings, pairs) {
  const [h, m] = settings.start.split(':').map(Number);
  let time = h * 60 + m;
  const slots = [];
  for (let round = 0; round < 5; round++) {
    for (let offset = 0; offset < 3; offset += settings.fields) {
      for (let field = 0; field < settings.fields && offset + field < 3; field++) slots.push({ time, field: field + 1, pair: pairs[round * 3 + offset + field] });
      time += settings.minutes + settings.transition;
    }
  }
  time += settings.break - settings.transition;
  // Placement games then a standalone final, so everyone can watch it.
  slots.push({ time, field: 1 });
  if (settings.fields === 1) time += settings.minutes + settings.transition;
  slots.push({ time, field: settings.fields });
  time += settings.minutes + settings.transition;
  slots.push({ time, field: 1 });
  return { slots, end: time + settings.minutes };
}
