(() => {
  const portraits = [
    { milestone: 0, file: 'family-burgers-president-2026.png', width: 1312, height: 1199 },
    { milestone: 30, file: 'family-burgers-president-30-2026.png', width: 1312, height: 1199 },
    { milestone: 60, file: 'family-burgers-portrait-60-v3.png', width: 1312, height: 1199 },
    { milestone: 100, file: 'family-burgers-portrait-100-v3.png', width: 1043, height: 1508 },
    { milestone: 150, file: 'family-burgers-portrait-150-v3.png', width: 1024, height: 1536 },
    { milestone: 200, file: 'family-burgers-portrait-200-v3.png', width: 971, height: 1619 },
  ];

  window.setFamilyBurgerPortrait = (scene, count, assetBase = 'images/') => {
    const image = scene.querySelector('.family-burgers-president');
    const nextHat = scene.querySelector('.family-burger-next-hat');
    let portrait = portraits[0];
    for (const candidate of portraits) {
      if (count >= candidate.milestone) portrait = candidate;
    }
    if (portrait.milestone) scene.dataset.burgerMilestone = String(portrait.milestone);
    else delete scene.dataset.burgerMilestone;
    const source = assetBase + portrait.file;
    if (image.getAttribute('src') !== source) image.src = source;
    image.width = portrait.width;
    image.height = portrait.height;
    if (nextHat) {
      const next = portraits.find(candidate => candidate.milestone > count);
      nextHat.hidden = !next;
      if (next) {
        const remaining = next.milestone - count;
        nextHat.textContent = `Encore ${remaining} burger${remaining > 1 ? 's' : ''} avant le prochain chapeau de JM`;
      }
    }
  };
})();
