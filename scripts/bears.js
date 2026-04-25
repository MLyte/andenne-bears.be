const siteHeader = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector("#main-nav");
const iconMenuOpen = document.querySelector(".icon-menu-open");
const iconMenuClose = document.querySelector(".icon-menu-close");
const form = document.querySelector("#contact-form");
const result = document.querySelector("#contact-result");

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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
  }
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const name = data.get("Nom") || "Un futur Bear";
  const selectedProfile = data.get("Profil") || "essai";
  const profileSettingsForSubmit = profileSettings[selectedProfile] || profileSettings.essai;
  const profileName = profileSettingsForSubmit.name;
  const channel = data.get("Canal prefere") || "messenger";
  const contact = data.get("Contact") || "";
  const message = data.get("Message") || "";
  const channelSettingsForSubmit = channelSettings[channel] || channelSettings.messenger;
  const channelUrl = channelSettingsForSubmit.url;
  const channelName = channelSettingsForSubmit.name;
  const summary = `${name} - ${profileName}\nContact souhaité\u00a0: ${channelName} (${contact})\n\n${message}`;
  const safeChannel = escapeHTML(channelName);
  const safeSummary = escapeHTML(summary);

  result.hidden = false;
  result.innerHTML = `
    <strong>Demande prête.</strong>
    <p>Copie ce message puis finalise le contact via ${safeChannel}. Le formulaire deviendra automatique dès qu'un outil de réception sera choisi.</p>
    <textarea readonly rows="6">${safeSummary}</textarea>
    ${
      channelUrl
        ? `<a class="button button-dark" href="${channelUrl}" target="_blank" rel="noopener">Ouvrir ${safeChannel}</a>`
        : `<p class="contact-note">Parfait. Nous te recontacterons directement via ${safeChannel}.</p>`
    }
  `;
});
