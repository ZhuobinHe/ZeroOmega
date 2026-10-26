import { tr, compareProfile, getProfileIcon } from '../../network/js/utils.js';

export const profileText = (profile) => {
  const name = profile.name || '';
  let text = tr('profile_' + name) || name;
  if (profile.defaultProfileName) {
    text += ' [' + profile.defaultProfileName + ']';
  }
  return text;
};

const targetProfileOf = (profile, options) => {
  if (profile && profile.profileType === 'VirtualProfile') {
    return (options && options['+' + profile.defaultProfileName]) || profile;
  }
  return profile;
};

export const createProfileIcon = (profile, options) => {
  const target = targetProfileOf(profile, options);
  const icon = document.createElement('span');
  icon.className = 'glyphicon ' + getProfileIcon(target);
  if (target !== profile) {
    icon.className += ' om-virtual-profile-icon';
  }
  icon.style.color = target.color || '#337ab7';
  return icon;
};

let openSelect = null;
let outsideCloseBound = false;

const bindOutsideClose = () => {
  if (outsideCloseBound) return;
  outsideCloseBound = true;
  document.addEventListener('click', (event) => {
    if (openSelect && !openSelect.contains(event.target)) {
      closeOpenSelect();
    }
  });
};

export const closeOpenSelect = () => {
  if (openSelect) {
    openSelect.classList.remove('open');
    openSelect = null;
  }
};

/**
 * Create an inline profile dropdown. The menu is expanded in place instead of
 * floating, so that it is never clipped by the popup frame.
 * @param {{profiles: {}[], options: {}, selectedName: string,
 *   onChange: ?Function}} params
 * @returns {{element: {}, getValue: Function, setValue: Function}}
 */
export const createProfileSelect = (params) => {
  const profiles = (params.profiles || []).slice().sort(compareProfile);
  const options = params.options || {};
  const selectedName = params.selectedName;
  let currentName = selectedName;

  const container = document.createElement('div');
  container.className = 'qr-profile-select';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-default qr-profile-toggle';

  const menu = document.createElement('ul');
  menu.className = 'qr-profile-menu';

  const updateToggle = (name) => {
    const profile = options['+' + name] || {
      name: name,
      profileType: 'DirectProfile',
    };
    toggle.innerHTML = '';
    toggle.appendChild(createProfileIcon(profile, options));
    const text = document.createElement('span');
    text.className = 'qr-profile-name';
    text.textContent = profileText(profile);
    toggle.appendChild(text);
    const caret = document.createElement('span');
    caret.className = 'caret';
    toggle.appendChild(caret);
  };

  const setCurrent = (name, notify) => {
    currentName = name;
    updateToggle(name);
    menu.querySelectorAll('.qr-profile-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.profile === name);
    });
    if (notify && params.onChange) {
      params.onChange(name);
    }
  };

  profiles.forEach((profile) => {
    if (profile.name.indexOf('__') === 0) return;
    const item = document.createElement('li');
    item.className = 'qr-profile-item';
    item.dataset.profile = profile.name;
    const link = document.createElement('a');
    link.href = '#';
    link.setAttribute('role', 'button');
    link.appendChild(createProfileIcon(profile, options));
    const text = document.createElement('span');
    text.textContent = profileText(profile);
    link.appendChild(text);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeOpenSelect();
      setCurrent(profile.name, true);
    });
    link.addEventListener('mousedown', (event) => event.preventDefault());
    item.appendChild(link);
    menu.appendChild(item);
  });

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const isOpen = container.classList.contains('open');
    closeOpenSelect();
    if (!isOpen) {
      container.classList.add('open');
      openSelect = container;
    }
  });

  bindOutsideClose();
  container.appendChild(toggle);
  container.appendChild(menu);
  setCurrent(selectedName, false);

  return {
    element: container,
    getValue: () => currentName,
    setValue: (name) => setCurrent(name, false),
  };
};
