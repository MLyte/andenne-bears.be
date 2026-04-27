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
const siteChat = document.querySelector("[data-site-chat]");
const siteChatToggle = document.querySelector("[data-site-chat-toggle]");
const siteChatClose = document.querySelector("[data-site-chat-close]");
const siteChatPanel = document.querySelector("#site-chat-panel");
const chatForm = document.querySelector("#chat-form");
const chatResult = document.querySelector("#chat-result");
const siteFooter = document.querySelector(".site-footer");
const backToTop = document.querySelector("[data-back-to-top]");

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
    submitLabel: "Envoyer ma demande d'essai",
    messagePlaceholder: "Dis-nous ce que tu veux découvrir, ton expérience éventuelle et tes disponibilités.",
  },
  parent: {
    name: "Question parent",
    ageRequired: false,
    messageRequired: true,
    submitLabel: "Envoyer ma question parent",
    messagePlaceholder: "Pose ta question et ajoute l'âge du jeune si c'est utile.",
  },
  partenariat: {
    name: "Partenariat",
    ageRequired: false,
    messageRequired: true,
    submitLabel: "Envoyer ma demande partenaire",
    messagePlaceholder: "Explique le type de partenariat ou de soutien envisagé.",
  },
  benevolat: {
    name: "Bénévolat",
    ageRequired: false,
    messageRequired: true,
    submitLabel: "Proposer mon aide",
    messagePlaceholder: "Dis-nous comment tu aimerais aider le club.",
  },
  autre: {
    name: "Autre demande",
    ageRequired: false,
    messageRequired: true,
    submitLabel: "Envoyer ma demande",
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
const chatFormStart = document.querySelector("#chat-form-start");
const csrfTokens = document.querySelectorAll('input[name="csrf_token"]');
const formSubmit = form?.querySelector('button[type="submit"]');
const chatSubmit = chatForm?.querySelector('button[type="submit"]');
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
  if (formSubmit) {
    formSubmit.textContent = settings.submitLabel || "Envoyer ma demande";
  }
};

contactMethod?.addEventListener("change", updateContactField);
profile?.addEventListener("change", updateProfileRequirements);
updateContactField();
updateProfileRequirements();

if (formStart) {
  formStart.value = String(Date.now());
}

if (chatFormStart) {
  chatFormStart.value = String(Date.now());
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
  if (!csrfTokens.length) {
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
      csrfTokens.forEach((token) => {
        token.value = parsed.data.csrfToken;
      });
      isContactBackendAvailable = true;
    }
  } catch {
    isContactBackendAvailable = false;
  }
};

loadCsrfToken();

const openSiteChat = () => {
  if (!siteChatPanel || !siteChatToggle) {
    return;
  }

  siteChatPanel.hidden = false;
  siteChatToggle.setAttribute("aria-expanded", "true");
  siteChatToggle.setAttribute("aria-label", "Fermer le message au club");
  siteChat?.classList.add("is-open");

  const canAutoFocus = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (canAutoFocus) {
    siteChatPanel
      .querySelector('.site-chat-form input:not([type="hidden"]), .site-chat-form textarea, .site-chat-form button')
      ?.focus();
  }
};

const closeSiteChat = () => {
  if (!siteChatPanel || !siteChatToggle) {
    return;
  }

  siteChatPanel.hidden = true;
  siteChatToggle.setAttribute("aria-expanded", "false");
  siteChatToggle.setAttribute("aria-label", "Ouvrir le message au club");
  siteChat?.classList.remove("is-open");
  siteChatToggle.focus();
};

const updateSiteChatFooterOffset = () => {
  if (!siteFooter) {
    return;
  }

  const footerRect = siteFooter.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportBottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
  const overlap = Math.max(0, viewportBottom - footerRect.top);
  const footerOffset = `${Math.round(overlap)}px`;
  siteChat?.style.setProperty("--footer-offset", footerOffset);
  siteChat?.classList.toggle("is-above-footer", overlap > 0);
  backToTop?.style.setProperty("--footer-offset", footerOffset);
  backToTop?.classList.toggle("is-above-footer", overlap > 0);
};

const updateBackToTopVisibility = () => {
  backToTop?.classList.toggle("is-visible", window.scrollY > 520);
};

if (siteFooter) {
  window.addEventListener("scroll", updateSiteChatFooterOffset, { passive: true });
  window.addEventListener("resize", updateSiteChatFooterOffset);
  window.visualViewport?.addEventListener("scroll", updateSiteChatFooterOffset, { passive: true });
  window.visualViewport?.addEventListener("resize", updateSiteChatFooterOffset);
  updateSiteChatFooterOffset();
}

if (backToTop) {
  window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
  window.addEventListener("resize", updateBackToTopVisibility);
  updateBackToTopVisibility();
}

backToTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

siteChatToggle?.addEventListener("click", () => {
  if (siteChatPanel?.hidden) {
    openSiteChat();
  } else {
    closeSiteChat();
  }
});

siteChatClose?.addEventListener("click", closeSiteChat);

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
let carouselDragPointerId = null;
let carouselDragStartX = 0;
let carouselDragStartScrollLeft = 0;

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

photoCarousel?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !photoCarousel) {
    return;
  }

  event.preventDefault();
  carouselDragPointerId = event.pointerId;
  carouselDragStartX = event.clientX;
  carouselDragStartScrollLeft = photoCarousel.scrollLeft;
  photoCarousel.classList.add("is-dragging");
  photoCarousel.setPointerCapture(event.pointerId);
});

photoCarousel?.addEventListener("pointermove", (event) => {
  if (!photoCarousel || carouselDragPointerId !== event.pointerId) {
    return;
  }

  const dragDelta = event.clientX - carouselDragStartX;
  photoCarousel.scrollLeft = carouselDragStartScrollLeft - dragDelta;
  event.preventDefault();
});

const stopCarouselDrag = (event) => {
  if (!photoCarousel || carouselDragPointerId !== event.pointerId) {
    return;
  }

  carouselDragPointerId = null;
  photoCarousel.classList.remove("is-dragging");

  if (photoCarousel.hasPointerCapture(event.pointerId)) {
    photoCarousel.releasePointerCapture(event.pointerId);
  }
};

photoCarousel?.addEventListener("pointerup", stopCarouselDrag);
photoCarousel?.addEventListener("pointercancel", stopCarouselDrag);
photoCarousel?.addEventListener("lostpointercapture", (event) => {
  if (carouselDragPointerId === event.pointerId) {
    carouselDragPointerId = null;
    photoCarousel?.classList.remove("is-dragging");
  }
});
photoCarousel?.addEventListener("scroll", requestCarouselUpdate, { passive: true });
window.addEventListener("resize", requestCarouselUpdate);
updateCarouselButtons();

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    if (!siteChatPanel?.hidden) {
      closeSiteChat();
    }
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
      }
      await loadCsrfToken();
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

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  chatResult.hidden = false;
  chatResult.classList.remove("is-success", "is-error");

  if (!isContactBackendAvailable) {
    chatResult.classList.add("is-error");
    chatResult.textContent = "Le message au club est momentanément indisponible. Réessaie dans quelques instants.";
    return;
  }

  chatSubmit.disabled = true;
  chatResult.textContent = "Envoi en cours...";

  fetch(chatForm.action, {
    method: "POST",
    body: new FormData(chatForm),
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
      chatResult.classList.add(isSuccess ? "is-success" : "is-error");
      chatResult.textContent = isSuccess
        ? "Message envoyé. On te répond via Messenger, email ou téléphone."
        : message;

      if (isSuccess) {
        chatForm.reset();
        if (chatFormStart) {
          chatFormStart.value = String(Date.now());
        }
      }
      await loadCsrfToken();
    })
    .catch(() => {
      chatResult.classList.add("is-error");
      chatResult.textContent = "Une erreur réseau empêche l'envoi du message.";
    })
    .finally(() => {
      chatSubmit.disabled = false;
    });
});
