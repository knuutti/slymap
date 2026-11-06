/* Menu bar, dialogs and shortcuts for pages in the desktop-application style
 * (calibrate.html). A menu item runs an existing control, so nothing is wired
 * twice:
 *   data-run="id"     clicks the element with that id (a file input opens its picker)
 *   data-check="id"   ticks the item while that checkbox is checked or button pressed
 *   data-open="id"    shows a dialog (an .overlay with `hidden`)
 *   data-href="url"   goes to a page
 * Items whose control is missing, disabled or inside something hidden are greyed out. */

(() => {
  const byId = (id) => document.getElementById(id);
  let openMenu = null;

  function unavailable(element) {
    return !element || element.disabled || !!element.closest('[hidden]');
  }

  function closeMenus() {
    openMenu?.classList.remove('open');
    openMenu = null;
  }

  function showMenu(menu) {
    closeMenus();
    menu.querySelectorAll('[data-run]').forEach((item) => {
      const target = byId(item.dataset.run);
      // a file input is hidden on purpose; its label button is what counts
      item.disabled = target?.type == 'file' ? target.disabled : unavailable(target);
    });
    menu.querySelectorAll('[data-check]').forEach((item) => {
      const target = byId(item.dataset.check);
      const on = target && (target.type == 'checkbox' ? target.checked : target.getAttribute('aria-pressed') == 'true');
      item.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    menu.classList.add('open');
    openMenu = menu;
  }

  function openDialog(id) {
    closeMenus();
    byId(id).hidden = false;
    byId(id).querySelector('.footer button')?.focus();
  }

  document.querySelectorAll('.menu').forEach((menu) => {
    const title = menu.querySelector(':scope > button');
    title.addEventListener('click', () => (openMenu === menu ? closeMenus() : showMenu(menu)));
    title.addEventListener('mouseenter', () => {
      if (openMenu && openMenu !== menu) {
        showMenu(menu);
      }
    });
  });

  document.querySelectorAll('.items button').forEach((item) => {
    item.addEventListener('click', () => {
      closeMenus();
      if (item.dataset.run) {
        byId(item.dataset.run)?.click();
      } else if (item.dataset.open) {
        openDialog(item.dataset.open);
      } else if (item.dataset.href) {
        window.location.href = item.dataset.href;
      }
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (openMenu && !openMenu.contains(event.target)) {
      closeMenus();
    }
  });

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => { button.closest('.overlay').hidden = true; });
  });

  // shortcuts that work everywhere, even while typing in a field
  document.addEventListener('keydown', (event) => {
    const dialog = document.querySelector('.overlay:not([hidden])');
    if (event.key == 'Escape' && (openMenu || dialog)) {
      if (openMenu) {
        closeMenus();
      } else {
        dialog.hidden = true;
      }
    } else if (event.key == 'F1') {
      openDialog('help');
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() == 'o') {
      byId('image-file')?.click();
    } else {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
