(() => {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .custom-queue-picker { position:relative; z-index:30; }
    .custom-queue-picker .native-queue-select { display:none !important; }
    .custom-queue-picker .select-chevron { display:none !important; }
    .queue-picker-trigger { width:100%; min-height:42px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:11px 13px; border:1px solid rgba(180,91,255,.52); border-radius:15px; background:linear-gradient(135deg,#211431,#171024); color:#f7f2ff; font:700 13px Montserrat, sans-serif; text-align:left; cursor:pointer; box-shadow:0 0 15px rgba(175,64,255,.08); transition:border-color .18s,box-shadow .18s,transform .18s; }
    .queue-picker-trigger:hover { border-color:rgba(214,139,255,.78); box-shadow:0 0 20px rgba(175,64,255,.16); }
    .queue-picker-trigger:focus-visible,.queue-picker-option:focus-visible { outline:2px solid #e28cff; outline-offset:2px; }
    .queue-picker-arrow { color:#d993ff; transition:transform .18s ease; }
    .queue-picker-trigger[aria-expanded="true"] .queue-picker-arrow { transform:rotate(180deg); }
    .queue-card.queue-picker-open { align-items:flex-start; }
    .queue-card.queue-picker-open > div:first-child { padding-top:13px; }
    .custom-queue-picker { flex-shrink:0; width:min(220px,40vw); }
    .queue-picker-trigger[aria-expanded="true"] { border-bottom-left-radius:0; border-bottom-right-radius:0; }
    .queue-picker-popup { position:static; z-index:auto; width:100%; min-width:0; max-height:none; overflow:visible; margin:0; padding:6px; border:1px solid rgba(185,107,255,.42); border-top:0; border-radius:0 0 15px 15px; background:linear-gradient(145deg,rgba(31,20,47,.98),rgba(14,10,24,.98)); box-shadow:0 12px 24px rgba(0,0,0,.22),inset 0 -1px rgba(255,255,255,.025); color:#f7f2ff; color-scheme:dark; animation:queueExpand .18s ease-out both; }
    .queue-picker-option { display:block; width:100%; padding:10px 11px; border:0; border-radius:11px; background:transparent; color:#eee3fa; font:600 12px Montserrat,sans-serif; text-align:left; cursor:pointer; transition:background .16s,color .16s; }
    .queue-picker-option:hover,.queue-picker-option[aria-selected="true"] { background:linear-gradient(100deg,rgba(165,61,255,.34),rgba(232,45,207,.22)); color:#fff; }
    html[data-theme="light"] .queue-picker-trigger { color:#21152d; background:linear-gradient(135deg,#fff9ff,#f2e8f8); }
    html[data-theme="light"] .queue-picker-arrow { color:#8e36bd; }
    html[data-theme="light"] .queue-picker-popup { color-scheme:light; background:#fffaff; color:#21152d; border-color:rgba(131,65,166,.25); box-shadow:0 12px 24px rgba(61,29,83,.12),inset 0 -1px rgba(131,65,166,.08); }
    html[data-theme="light"] .queue-picker-option { color:#33233f; }
    html[data-theme="light"] .queue-picker-option:hover,html[data-theme="light"] .queue-picker-option[aria-selected="true"] { background:#edd9fa; color:#281137; }
    @media(prefers-color-scheme:light) { html[data-theme="system"] .queue-picker-trigger { color:#21152d; background:linear-gradient(135deg,#fff9ff,#f2e8f8); } html[data-theme="system"] .queue-picker-arrow { color:#8e36bd; } html[data-theme="system"] .queue-picker-popup { color-scheme:light; background:#fffaff; color:#21152d; border-color:rgba(131,65,166,.25); box-shadow:0 12px 24px rgba(61,29,83,.12),inset 0 -1px rgba(131,65,166,.08); } html[data-theme="system"] .queue-picker-option { color:#33233f; } html[data-theme="system"] .queue-picker-option:hover,html[data-theme="system"] .queue-picker-option[aria-selected="true"] { background:#edd9fa; color:#281137; } }
    @keyframes queueExpand { from { opacity:0; transform:translateY(-5px); } to { opacity:1; transform:translateY(0); } }
  `;
  document.head.append(style);

  function setup() {
    const select = document.getElementById('queueSelect');
    if (!select || select.dataset.customQueueReady === 'true') return;
    select.dataset.customQueueReady = 'true';

    let oldHost = select.closest('.select-wrap') || select.parentElement;
    const host = document.createElement('div');
    host.className = 'select-wrap custom-queue-picker';
    while (oldHost.firstChild) host.append(oldHost.firstChild);
    oldHost.replaceWith(host);
    select.classList.add('native-queue-select');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;
    host.querySelectorAll('.select-chevron').forEach((node) => node.remove());

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'queue-picker-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Выбрать очередь');
    const label = document.createElement('span');
    const arrow = document.createElement('span');
    arrow.className = 'queue-picker-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '⌄';
    trigger.append(label, arrow);

    const popup = document.createElement('div');
    popup.className = 'queue-picker-popup';
    popup.id = 'queuePickerListbox';
    popup.setAttribute('role', 'listbox');
    popup.setAttribute('aria-label', 'Очереди');
    popup.hidden = true;
    trigger.setAttribute('aria-controls', popup.id);
    host.append(trigger, popup);

    function close(returnFocus = false) {
      popup.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      host.closest('.queue-card')?.classList.remove('queue-picker-open');
      if (returnFocus) trigger.focus();
    }

    function choose(option) {
      if (!option) return;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      close(true);
    }

    function sync() {
      const selected = select.options[select.selectedIndex];
      label.textContent = selected ? `Очередь ${selected.textContent.replace(/^Очередь\s*/i, '')}` : 'Выберите очередь';
      popup.replaceChildren();
      for (const nativeOption of select.options) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'queue-picker-option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', nativeOption.value === select.value ? 'true' : 'false');
        option.tabIndex = -1;
        option.textContent = nativeOption.textContent;
        option.dataset.value = nativeOption.value;
        option.addEventListener('click', () => choose(nativeOption));
        option.addEventListener('keydown', (event) => {
          const options = [...popup.querySelectorAll('.queue-picker-option')];
          const index = options.indexOf(option);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            options[(index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length]?.focus();
          } else if (event.key === 'Home') { event.preventDefault(); options[0]?.focus(); }
          else if (event.key === 'End') { event.preventDefault(); options[options.length - 1]?.focus(); }
          else if (event.key === 'Escape') { event.preventDefault(); close(true); }
        });
        popup.append(option);
      }
    }

    function open() {
      sync();
      popup.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      host.closest('.queue-card')?.classList.add('queue-picker-open');
      popup.querySelector('[aria-selected="true"]')?.focus();
    }

    trigger.addEventListener('click', () => popup.hidden ? open() : close());
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
    select.addEventListener('change', sync);
    document.addEventListener('pointerdown', (event) => { if (!host.contains(event.target)) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !popup.hidden) close(true); });
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected'] });
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
