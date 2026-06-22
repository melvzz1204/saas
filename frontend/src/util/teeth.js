// ./src/util/teeth.js

// 1. Definition Vectors for the 16-Tooth Arch Views
const MAXILLARY_ARCH = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
];
const MANDIBULAR_ARCH = [
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];

// 2. Active Application State Map
let activeArchData = MAXILLARY_ARCH;
let activeSelectedTooth = null;

// 3. Declare DOM variable placeholders globally
let container;
let btnMaxillary;
let btnMandibular;

// 4. Render Engine
function renderArcMap() {
  if (!container) return;
  container.innerHTML = "";

  activeArchData.forEach((toothNum) => {
    const isSelected = activeSelectedTooth === toothNum;
    const button = document.createElement("button");
    button.type = "button";

    button.className = `w-8 h-10 border rounded-md flex flex-col items-center justify-between py-1 transition-all shadow-2xs cursor-pointer group
            ${
              isSelected
                ? "bg-sky-600 border-sky-600 hover:bg-sky-700 text-white"
                : "bg-white border-slate-200 hover:border-sky-300 text-slate-800"
            }`;

    button.innerHTML = `
            <span class="text-[9px] font-mono font-bold tracking-tight transition-colors
                ${isSelected ? "text-sky-100" : "text-slate-400 group-hover:text-sky-600"}">
                ${toothNum}
            </span>
            <span class="text-xs transition-transform group-hover:scale-110">🦷</span>
        `;

    button.addEventListener("click", () => {
      activeSelectedTooth = isSelected ? null : toothNum;
      renderArcMap();
    });

    container.appendChild(button);
  });
}

// 5. Wire Up Toggle Button Matrix State Change Rules
function initToggleMatrix() {
  // If buttons don't exist on the current page, exit cleanly without crashing
  if (!btnMaxillary || !btnMandibular) return;

  const setActiveTabClasses = (activeBtn, inactiveBtn) => {
    activeBtn.className =
      "text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md cursor-pointer transition-all bg-white text-slate-800 shadow-2xs";
    inactiveBtn.className =
      "text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md cursor-pointer transition-all text-slate-500 hover:text-slate-800";
  };

  btnMaxillary.addEventListener("click", () => {
    if (activeArchData !== MAXILLARY_ARCH) {
      activeArchData = MAXILLARY_ARCH;
      activeSelectedTooth = null;
      setActiveTabClasses(btnMaxillary, btnMandibular);
      renderArcMap();
    }
  });

  btnMandibular.addEventListener("click", () => {
    if (activeArchData !== MANDIBULAR_ARCH) {
      activeArchData = MANDIBULAR_ARCH;
      activeSelectedTooth = null;
      setActiveTabClasses(btnMandibular, btnMaxillary);
      renderArcMap();
    }
  });
}

// 6. Runtime Pipeline Instantiation (Safely assigns DOM nodes after load)
document.addEventListener("DOMContentLoaded", () => {
  container = document.getElementById("odontogram-container");
  btnMaxillary = document.getElementById("toggle-maxillary");
  btnMandibular = document.getElementById("toggle-mandibular");

  initToggleMatrix();
  renderArcMap();
});
