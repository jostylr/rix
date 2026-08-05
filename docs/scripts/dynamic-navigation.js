const offset = document.querySelector('meta[name="quarto:offset"]')?.content || "./";
const siteRoot = new URL(offset, document.baseURI);

function siteUrl(href) {
  return /^https?:\/\//i.test(href) ? href : new URL(href, siteRoot).href;
}

function isCurrent(item) {
  if (item.external) return false;
  const current = new URL(document.location.href);
  const target = new URL(siteUrl(item.href));
  return current.pathname.replace(/\/$/, "/index.html") === target.pathname.replace(/\/$/, "/index.html");
}

function menuLink(item) {
  const container = document.createElement("div");
  container.className = "sidebar-item-container";
  const anchor = document.createElement("a");
  anchor.href = siteUrl(item.href);
  anchor.className = "sidebar-item-text sidebar-link";
  if (isCurrent(item)) anchor.classList.add("active");
  if (item.external) {
    anchor.rel = "noreferrer";
    anchor.target = "_blank";
  }
  const text = document.createElement("span");
  text.className = "menu-text";
  text.textContent = item.text;
  anchor.append(text);
  container.append(anchor);
  return container;
}

function menuItem(item) {
  const listItem = document.createElement("li");
  listItem.className = "sidebar-item";
  listItem.append(menuLink(item));
  return listItem;
}

function sectionItem(section, index) {
  const active = section.contents.some(isCurrent);
  const listItem = document.createElement("li");
  listItem.className = "sidebar-item sidebar-item-section";
  const container = document.createElement("div");
  container.className = "sidebar-item-container";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sidebar-item-text sidebar-link text-start rix-navigation-section";
  toggle.setAttribute("aria-expanded", String(active));
  toggle.setAttribute("aria-controls", `rix-sidebar-section-${index}`);
  const label = document.createElement("span");
  label.className = "menu-text";
  label.textContent = section.section;
  const icon = document.createElement("i");
  icon.className = "bi bi-chevron-right ms-2";
  toggle.append(label, icon);
  container.append(toggle);
  const contents = document.createElement("ul");
  contents.id = `rix-sidebar-section-${index}`;
  contents.className = "list-unstyled sidebar-section depth1";
  contents.hidden = !active;
  contents.append(...section.contents.map(menuItem));
  toggle.addEventListener("click", () => {
    contents.hidden = !contents.hidden;
    toggle.setAttribute("aria-expanded", String(!contents.hidden));
  });
  listItem.append(container, contents);
  return listItem;
}

function renderSidebar(items) {
  const container = document.querySelector("#quarto-sidebar .sidebar-menu-container");
  if (!container) return;
  const list = document.createElement("ul");
  list.className = "list-unstyled mt-1";
  items.forEach((item, index) => list.append(item.contents ? sectionItem(item, index) : menuItem(item)));
  container.replaceChildren(list);
}

function pagesOf(items) {
  return items.flatMap((item) => item.contents ? pagesOf(item.contents) : item.external ? [] : [item]);
}

function paginationLink(item, direction) {
  const wrapper = document.createElement("div");
  wrapper.className = `nav-page nav-page-${direction}`;
  if (!item) return wrapper;
  const anchor = document.createElement("a");
  anchor.href = siteUrl(item.href);
  anchor.className = "pagination-link";
  anchor.setAttribute("aria-label", item.text);
  const text = document.createElement("span");
  text.className = "nav-page-text";
  text.textContent = item.text;
  const icon = document.createElement("i");
  icon.className = `bi bi-arrow-${direction === "previous" ? "left" : "right"}-short`;
  anchor.append(...(direction === "previous" ? [icon, text] : [text, icon]));
  wrapper.append(anchor);
  return wrapper;
}

function renderPageNavigation(items) {
  const pages = pagesOf(items);
  const index = pages.findIndex(isCurrent);
  if (index === -1) return;
  const content = document.querySelector("main.content");
  if (!content) return;
  const existing = content.querySelector(":scope > .page-navigation");
  const navigation = existing || document.createElement("nav");
  navigation.className = "page-navigation";
  navigation.setAttribute("aria-label", "Page navigation");
  navigation.replaceChildren(
    paginationLink(pages[index - 1], "previous"),
    paginationLink(pages[index + 1], "next"),
  );
  if (!existing) content.insertBefore(navigation, content.querySelector(":scope > #quarto-back-to-top"));
}

async function mountNavigation() {
  try {
    const response = await fetch(new URL("_navigation.json", siteRoot), { cache: "no-cache" });
    if (!response.ok) throw new Error(`Documentation navigation request failed (${response.status})`);
    const { items } = await response.json();
    renderSidebar(items);
    renderPageNavigation(items);
  } catch (error) {
    console.warn("Documentation navigation could not be loaded.", error);
  }
}

mountNavigation();
