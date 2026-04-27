const siteHeader = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector("#main-nav");
const iconMenuOpen = document.querySelector(".icon-menu-open");
const iconMenuClose = document.querySelector(".icon-menu-close");
const form = document.querySelector("#contact-form");
const result = document.querySelector("#contact-result");
const photoCarousel = document.querySelector(".photo-carousel");
const photoCarouselTrack = document.querySelector(".photo-carousel-track");
const photoCarouselPrev = document.querySelector("[data-carousel-prev]");
const photoCarouselNext = document.querySelector("[data-carousel-next]");

const escapeHTML = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

const channelSettings = {
  messenger: {
    url: "https://m.me/andennebears",
    name: "Messenger",
    label: "Pseudo Messenger",
    type: "text",
    autocomplete: "off",
    inputMode: "text",
  },
  instagram: {
    url: "https://www.instagram.com/andennebears/",
    name: "Instagram",
    label: "Pseudo Instagram",
    type: "text",
    autocomplete: "off",
    inputMode: "text",
  },
  telephone: {
    url: null,
    name: "Téléphone",
    label: "Numéro de téléphone",
    type: "tel",
    autocomplete: "tel",
    inputMode: "tel",
  },
  email: {
    url: null,
    name: "Email",
    label: "Adresse email",
    type: "email",
    autocomplete: "email",
    inputMode: "email",
  },
};

const profileSettings = {
  essai: {
    name: "Je veux essayer",
    ageRequired: true,
    messageRequired: false,
    messagePlaceholder: "Dis-nous ce que tu veux découvrir, ton expérience éventuelle et tes disponibilités.",
  },
  parent: {
    name: "Question parent",
    ageRequired: false,
    messageRequired: true,
    messagePlaceholder: "Pose ta question et ajoute l'âge du jeune si c'est utile.",
  },
  partenariat: {
    name: "Partenariat",
    ageRequired: false,
    messageRequired: true,
    messagePlaceholder: "Explique le type de partenariat ou de soutien envisagé.",
  },
  benevolat: {
    name: "Bénévolat",
    ageRequired: false,
    messageRequired: true,
    messagePlaceholder: "Dis-nous comment tu aimerais aider le club.",
  },
  autre: {
    name: "Autre demande",
    ageRequired: false,
    messageRequired: true,
    messagePlaceholder: "Explique ta demande en quelques lignes.",
  },
};

const requiredText = "Obligatoire";
const optionalText = "Facultatif";

const contactMethod = document.querySelector("#contact-method");
const contactValue = document.querySelector("#contact-value");
const contactValueLabel = document.querySelector("[data-contact-value-label]");
const profile = document.querySelector("#profile");
const age = document.querySelector("#age");
const messageField = document.querySelector("#message");
const ageStatus = document.querySelector('[data-field-status="age"]');
const messageStatus = document.querySelector('[data-field-status="message"]');
const formStart = document.querySelector("#form-start");
const csrfToken = document.querySelector("#csrf-token");
const formSubmit = form?.querySelector('button[type="submit"]');
let isContactBackendAvailable = false;

const setRequiredState = (field, status, isRequired) => {
  if (field) {
    field.required = isRequired;
    field.setAttribute("aria-required", String(isRequired));
  }
  if (status) {
    status.textContent = isRequired ? requiredText : optionalText;
    status.classList.toggle("is-required", isRequired);
  }
};

const updateContactField = () => {
  const selectedChannel = contactMethod?.value || "messenger";
  const settings = channelSettings[selectedChannel] || channelSettings.messenger;
  if (contactValueLabel) {
    contactValueLabel.textContent = settings.label;
  }
  if (contactValue) {
    contactValue.type = settings.type;
    contactValue.autocomplete = settings.autocomplete;
    contactValue.inputMode = settings.inputMode;
    contactValue.placeholder = settings.label;
  }
};

const updateProfileRequirements = () => {
  const selectedProfile = profile?.value || "essai";
  const settings = profileSettings[selectedProfile] || profileSettings.essai;
  setRequiredState(age, ageStatus, settings.ageRequired);
  setRequiredState(messageField, messageStatus, settings.messageRequired);
  if (messageField) {
    messageField.placeholder = settings.messagePlaceholder;
  }
};

contactMethod?.addEventListener("change", updateContactField);
profile?.addEventListener("change", updateProfileRequirements);
updateContactField();
updateProfileRequirements();

if (formStart) {
  formStart.value = String(Date.now());
}

const readJsonResponse = async (response) => {
  const text = await response.text();
  try {
    return {
      isJson: true,
      data: JSON.parse(text),
    };
  } catch {
    return {
      isJson: false,
      data: null,
    };
  }
};

const loadCsrfToken = async () => {
  if (!csrfToken) {
    return;
  }

  try {
    const response = await fetch("contact.php?csrf=1", {
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    const parsed = await readJsonResponse(response);
    if (response.ok && parsed.isJson && parsed.data?.csrfToken) {
      csrfToken.value = parsed.data.csrfToken;
      isContactBackendAvailable = true;
    }
  } catch {
    isContactBackendAvailable = false;
  }
};

loadCsrfToken();

const closeMenu = () => {
  siteHeader?.classList.remove("is-menu-open");
  menuToggle?.setAttribute("aria-expanded", "false");
  menuToggle?.setAttribute("aria-label", "Ouvrir le menu");
  if (iconMenuOpen && iconMenuClose) {
    iconMenuOpen.hidden = false;
    iconMenuClose.hidden = true;
  }
};

menuToggle?.addEventListener("click", () => {
  const isOpen = siteHeader?.classList.toggle("is-menu-open");
  menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
  menuToggle.setAttribute(
    "aria-label",
    isOpen ? "Fermer le menu" : "Ouvrir le menu",
  );
  if (iconMenuOpen && iconMenuClose) {
    iconMenuOpen.hidden = Boolean(isOpen);
    iconMenuClose.hidden = !Boolean(isOpen);
  }
});

mainNav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    closeMenu();
  }
});

const getCarouselStep = () => {
  const firstCard = photoCarouselTrack?.querySelector(".photo-card");
  if (!firstCard || !photoCarouselTrack) {
    return 320;
  }

  const styles = window.getComputedStyle(photoCarouselTrack);
  const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
  return firstCard.getBoundingClientRect().width + gap;
};

const updateCarouselButtons = () => {
  if (!photoCarousel || !photoCarouselPrev || !photoCarouselNext) {
    return;
  }

  const maxScrollLeft = photoCarousel.scrollWidth - photoCarousel.clientWidth;
  photoCarouselPrev.disabled = photoCarousel.scrollLeft <= 2;
  photoCarouselNext.disabled = photoCarousel.scrollLeft >= maxScrollLeft - 2;
};

let carouselScrollFrame = null;

const requestCarouselUpdate = () => {
  if (carouselScrollFrame) {
    return;
  }

  carouselScrollFrame = window.requestAnimationFrame(() => {
    carouselScrollFrame = null;
    updateCarouselButtons();
  });
};

photoCarouselPrev?.addEventListener("click", () => {
  photoCarousel?.scrollBy({ left: -getCarouselStep(), behavior: "smooth" });
});

photoCarouselNext?.addEventListener("click", () => {
  photoCarousel?.scrollBy({ left: getCarouselStep(), behavior: "smooth" });
});

photoCarousel?.addEventListener("scroll", requestCarouselUpdate, { passive: true });
window.addEventListener("resize", requestCarouselUpdate);
updateCarouselButtons();

const heartbeatSection = document.querySelector(".slogan-section");
const heartbeatLine = document.querySelector(".heartbeat-line");
const heartbeatGold = document.querySelector(".heartbeat-line-gold");
const heartbeatRed = document.querySelector(".heartbeat-line-red");
const heartbeatShadow = document.querySelector(".heartbeat-line-shadow");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const initHeartbeatAnimation = () => {
  if (
    !heartbeatSection ||
    !heartbeatLine ||
    !heartbeatGold ||
    !heartbeatRed ||
    !heartbeatShadow ||
    prefersReducedMotion.matches
  ) {
    return;
  }

  heartbeatSection.classList.add("is-heartbeat-enhanced");

  const dashLength = 1760;
  const pulseShape = [
    [0, 520],
    [0.12, 360],
    [0.18, 120],
    [0.26, -260],
    [0.42, -560],
    [1, -1240],
  ];
  const beatDurations = [3300, 3740, 3460, 4020];
  const amplitudes = [1, 0.86, 1.12, 0.94];
  let animationFrame = null;
  let isVisible = false;
  let cycleStart = performance.now();
  let beatIndex = 0;

  const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
  const easeInOutSine = (value) => -(Math.cos(Math.PI * value) - 1) / 2;

  const interpolateShape = (progress) => {
    for (let index = 1; index < pulseShape.length; index += 1) {
      const [currentProgress, currentOffset] = pulseShape[index];
      const [previousProgress, previousOffset] = pulseShape[index - 1];
      if (progress <= currentProgress) {
        const localProgress = (progress - previousProgress) / (currentProgress - previousProgress);
        const easedProgress = index <= 3 ? easeOutCubic(localProgress) : easeInOutSine(localProgress);
        return previousOffset + (currentOffset - previousOffset) * easedProgress;
      }
    }
    return pulseShape[pulseShape.length - 1][1];
  };

  const animateHeartbeat = (timestamp) => {
    const duration = beatDurations[beatIndex % beatDurations.length];
    let progress = (timestamp - cycleStart) / duration;

    if (progress >= 1) {
      cycleStart = timestamp;
      beatIndex += 1;
      progress = 0;
    }

    const amplitude = amplitudes[beatIndex % amplitudes.length];
    const offset = interpolateShape(progress);
    const impulse = Math.max(
      0,
      1 - Math.abs(progress - 0.22) / 0.16,
    ) * amplitude;
    const aftershock = Math.max(
      0,
      1 - Math.abs(progress - 0.34) / 0.14,
    ) * amplitude;

    heartbeatGold.style.strokeDasharray = `220 ${dashLength - 220}`;
    heartbeatRed.style.strokeDasharray = `180 ${dashLength - 180}`;
    heartbeatGold.style.strokeDashoffset = String(offset);
    heartbeatRed.style.strokeDashoffset = String(offset - 42 - aftershock * 34);
    heartbeatGold.style.opacity = String(0.48 + impulse * 0.52);
    heartbeatRed.style.opacity = String(0.18 + aftershock * 0.42);
    heartbeatGold.style.strokeWidth = String(5.4 + impulse * 2.8);
    heartbeatRed.style.strokeWidth = String(2.2 + aftershock * 1.4);
    heartbeatShadow.style.opacity = String(0.14 + impulse * 0.32);
    heartbeatShadow.style.strokeWidth = String(18 + impulse * 12);
    heartbeatLine.style.transform = `translate(-50%, -50%) scale(${1 + impulse * 0.012})`;

    if (isVisible) {
      animationFrame = window.requestAnimationFrame(animateHeartbeat);
    }
  };

  const startHeartbeat = () => {
    if (animationFrame || prefersReducedMotion.matches) {
      return;
    }
    isVisible = true;
    cycleStart = performance.now();
    animationFrame = window.requestAnimationFrame(animateHeartbeat);
  };

  const stopHeartbeat = () => {
    isVisible = false;
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startHeartbeat();
        } else {
          stopHeartbeat();
        }
      },
      { threshold: 0.18 },
    );
    observer.observe(heartbeatSection);
  } else {
    startHeartbeat();
  }

  const handleMotionPreferenceChange = (event) => {
    if (event.matches) {
      stopHeartbeat();
    } else {
      startHeartbeat();
    }
  };

  if (typeof prefersReducedMotion.addEventListener === "function") {
    prefersReducedMotion.addEventListener("change", handleMotionPreferenceChange);
  } else if (typeof prefersReducedMotion.addListener === "function") {
    prefersReducedMotion.addListener(handleMotionPreferenceChange);
  }
};

initHeartbeatAnimation();

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
  }
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  result.hidden = false;
  result.classList.remove("is-success", "is-error");

  if (!isContactBackendAvailable) {
    result.classList.add("is-error");
    result.innerHTML = `
      <strong>Envoi indisponible.</strong>
      <p>Le serveur PHP doit être actif pour envoyer le message automatiquement. Réessaie dans quelques instants ou contacte-nous via Messenger.</p>
    `;
    return;
  }

  formSubmit.disabled = true;
  result.innerHTML = "<strong>Envoi en cours...</strong>";

  fetch(form.action, {
    method: "POST",
    body: new FormData(form),
    headers: {
      Accept: "application/json",
    },
    credentials: "same-origin",
  })
    .then(async (response) => {
      const parsed = await readJsonResponse(response);
      if (!parsed.isJson) {
        throw new Error("invalid-response");
      }

      const message = parsed.data?.message || "Une erreur est survenue.";
      const isSuccess = Boolean(response.ok && parsed.data?.success);
      result.classList.add(isSuccess ? "is-success" : "is-error");
      result.innerHTML = `
        <strong>${isSuccess ? "Message envoyé." : "Envoi impossible."}</strong>
        <p>${escapeHTML(message)}</p>
      `;

      if (isSuccess) {
        form.reset();
        updateContactField();
        updateProfileRequirements();
        if (formStart) {
          formStart.value = String(Date.now());
        }
        await loadCsrfToken();
      }
    })
    .catch(() => {
      result.classList.add("is-error");
      result.innerHTML = `
        <strong>Envoi impossible.</strong>
        <p>Une erreur réseau empêche l'envoi du message. Réessaie dans quelques instants.</p>
      `;
    })
    .finally(() => {
      formSubmit.disabled = false;
    });
});
