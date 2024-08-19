const { invoke } = window.__TAURI__.tauri;

let isExploring = false;
let singleClickTimer = null;
const SINGLE_CLICK_DELAY = 500;
let favorites = [];
let isFirstLoad = true;

document.addEventListener('DOMContentLoaded', async () => {
  favorites = await loadFavoritesLocally();
  renderFolderTree();

  // Add event listener to listen for search results
  window.__TAURI__.event.listen('search_result', (event) => {
    const result = event.payload;
    if (result) {
      // Append each search result to the dropdown as it arrives
      appendSearchResult(result);
    }
  });

  // Add event listener for hitting "Enter" to perform search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      performSearch();
    }
  });
});

function showCustomAlert(message) {
  const alertOverlay = document.getElementById('alertOverlay');
  const customAlert = document.getElementById('customAlert');
  document.getElementById('alertMessage').textContent = message;

  alertOverlay.style.display = 'block';
  customAlert.style.display = 'block';

  // Trigger reflow
  alertOverlay.offsetHeight;
  customAlert.offsetHeight;

  alertOverlay.classList.remove('hide');
  customAlert.classList.remove('hide');
  alertOverlay.classList.add('show');
  customAlert.classList.add('show');
}

function hideCustomAlert() {
  const alertOverlay = document.getElementById('alertOverlay');
  const customAlert = document.getElementById('customAlert');
  alertOverlay.classList.remove('show');
  customAlert.classList.remove('show');
  alertOverlay.classList.add('hide');
  customAlert.classList.add('hide');
  setTimeout(() => {
    alertOverlay.style.display = 'none';
    customAlert.style.display = 'none';
  }, 500);
}

async function browseFolder() {
  folderPath = await invoke('browse_folder');
  if (folderPath) {
    renderFolderTree();
  }
}

async function renderHomeFolder() {
  folderPath = "\\\\172.16.10.81\\Resource_RNDS";

  try {
    const structure = await invoke('read_directory_async', { folderPath });
    if (structure && structure.length > 0) {
      // Sort the structure array using natural sorting
      structure.sort(naturalCompare);
      renderTree(document.getElementById('folderTree'), structure);
    } else {
      showCustomAlert('Folder not found or it is empty.');
    }
  } catch (error) {
    console.error('Error reading directory:', error);
    showCustomAlert(`Error reading directory: ${error}`);
  } finally {
    hideLoading();
  }
}

async function renderFolderTree() {
  showLoading();
  if (isFirstLoad) {
    folderPath = "\\\\172.16.10.81\\Resource_RNDS";
    isFirstLoad = false;
  }

  try {
    const structure = await invoke('read_directory_async', { folderPath });
    if (structure && structure.length > 0) {
      // Sort the structure array using natural sorting
      structure.sort(naturalCompare);
      renderTree(document.getElementById('folderTree'), structure);
    } else {
      showCustomAlert('Folder not found or it is empty.');
    }
  } catch (error) {
    console.error('Error reading directory:', error);
    showCustomAlert(`Error reading directory: ${error}`);
  } finally {
    hideLoading();
  }
}

function naturalCompare(a, b) {
  const ax = [], bx = [];

  a.name.replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
    ax.push([$1 || Infinity, $2 || ""]);
  });
  b.name.replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
    bx.push([$1 || Infinity, $2 || ""]);
  });

  while (ax.length && bx.length) {
    const an = ax.shift();
    const bn = bx.shift();
    const nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
    if (nn) return nn;
  }

  return ax.length - bx.length;
}

function showLoading() {
  document.getElementById('loadingIndicator').style.display = 'block';
  document.getElementById('loadingOverlay').style.display = 'block';
}

function hideLoading() {
  document.getElementById('loadingIndicator').style.display = 'none';
  document.getElementById('loadingOverlay').style.display = 'none';
}

function renderTree(container, structure) {
  container.innerHTML = '';
  const ul = document.createElement('ul');

  structure.forEach(node => {
    const li = document.createElement('li');
    li.className = node.is_directory ? 'folder' : 'file';

    const span = document.createElement('span');
    span.dataset.path = node.path;
    span.textContent = node.name;

    const starIcon = document.createElement('i');
    starIcon.className = isFavorite(node) ? 'fas fa-star favorite-icon-filled' : 'far fa-star favorite-icon';
    starIcon.addEventListener('click', event => {
      event.stopPropagation();
      toggleFavorite(node, starIcon);
    });

    li.appendChild(span);
    li.appendChild(starIcon);
    ul.appendChild(li);
  });

  container.appendChild(ul);
  addTreeEventListeners();
  addFavoriteClickEventListeners();
}

function isFavorite(node) {
  return favorites.findIndex(fav => fav.name === node.name && fav.path === node.path) !== -1;
}

function toggleFavorite(node, starIcon) {
  if (isFavorite(node)) {
    removeFavorite(node, starIcon);
  } else {
    addFavorite(node, starIcon);
  }
}

function addFavorite(node, starIcon) {
  const favoriteTab = document.getElementById('favoriteTabs');
  const span = document.createElement('span');
  const removeIcon = document.createElement('i');
  removeIcon.className = 'fas fa-times remove-icon';
  removeIcon.addEventListener('click', event => {
    event.stopPropagation();
    removeFavorite(node, null, true);
  });

  span.dataset.path = node.path;
  span.textContent = node.name;
  span.appendChild(removeIcon);

  favorites.push(node);
  favoriteTab.appendChild(span);
  favoriteTab.scrollLeft = favoriteTab.scrollWidth;

  if (starIcon) starIcon.className = 'fas fa-star favorite-icon-filled';
  saveFavoritesLocally();
}

function removeFavorite(node, starIcon, updateTree = false) {
  favorites = favorites.filter(fav => fav.name !== node.name || fav.path !== node.path);

  if (starIcon) {
    starIcon.className = 'far fa-star favorite-icon';
  }

  const favoriteTab = document.getElementById('favoriteTabs');
  const spans = favoriteTab.querySelectorAll('span');
  spans.forEach(span => {
    if (span.dataset.path === node.path && span.textContent.includes(node.name)) {
      favoriteTab.removeChild(span);
    }
  });

  if (updateTree) {
    updateFavoriteIcons();
  }

  saveFavoritesLocally();
}

function updateFavoriteIcons() {
  const starIcons = document.querySelectorAll('.favorite-icon-filled');
  starIcons.forEach(icon => {
    const parentSpan = icon.previousSibling;
    if (parentSpan && !isFavorite({ name: parentSpan.textContent, path: parentSpan.dataset.path })) {
      icon.className = 'far fa-star favorite-icon';
    }
  });
}

function addTreeEventListeners() {
  const folderTree = document.querySelector('.folder-tree');
  folderTree.addEventListener('click', handleTreeClick);
  folderTree.addEventListener('dblclick', handleTreeDoubleClick);
}

function handleTreeClick(event) {
  if (event.target.tagName.toLowerCase() === 'span' && event.target.parentNode.classList.contains('folder')) {
    clearTimeout(singleClickTimer);
    singleClickTimer = setTimeout(() => {
      const parentLi = event.target.parentNode;
      const isExpanded = parentLi.classList.toggle('expanded');

      if (isExpanded && !parentLi.classList.contains('loaded')) {
        loadFolderContents(event.target.dataset.path, parentLi);
      }
    }, SINGLE_CLICK_DELAY);
  }
}

function handleTreeDoubleClick(event) {
  clearTimeout(singleClickTimer);
  if (event.target.tagName.toLowerCase() === 'span') {
    const parentLi = event.target.parentNode;
    const path = event.target.dataset.path;

    if (parentLi.classList.contains('folder') && path && !isExploring) {
      openFolder(path);
    } else if (parentLi.classList.contains('file') && path) {
      openFile(path);
    }
  }
}

async function loadFolderContents(folderPath, parentLi) {
  parentLi.classList.add('loading');
  showLoading();

  try {
    const children = await invoke('read_directory_async', { folderPath });
    parentLi.classList.remove('loading');
    parentLi.classList.add('loaded');
    if (children.length > 0) {
      // Sort the structure array using natural sorting
      children.sort(naturalCompare);
      const ul = document.createElement('ul');
      children.forEach(child => {
        const li = document.createElement('li');
        li.className = child.is_directory ? 'folder' : 'file';

        const span = document.createElement('span');
        span.dataset.path = child.path;
        span.textContent = child.name;

        const starIcon = document.createElement('i');
        starIcon.className = isFavorite(child) ? 'fas fa-star favorite-icon-filled' : 'far fa-star favorite-icon';
        starIcon.addEventListener('click', event => {
          event.stopPropagation();
          toggleFavorite(child, starIcon);
        });

        li.appendChild(span);
        li.appendChild(starIcon);
        ul.appendChild(li);
      });
      parentLi.appendChild(ul);
    } else {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'empty';
      emptyLi.textContent = 'Empty folder';
      const ul = document.createElement('ul');
      ul.appendChild(emptyLi);
      parentLi.appendChild(ul);
    }
  } catch (error) {
    console.error('Error reading directory:', error);
    showCustomAlert(`Error reading directory: ${error}`);
  } finally {
    hideLoading();
  }
}

async function openFolder(folderPath) {
  if (folderPath) {
    folderPath = folderPath.replace(/\\/g, '\\\\');
    isExploring = true;
    await invoke('open_folder', { folderPath });
    isExploring = false;
  }
}

async function openFile(filePath) {
  if (filePath) {
    await invoke('open_file', { filePath });
  }
}

function addFavoriteClickEventListeners() {
  const favoriteTabs = document.getElementById('favoriteTabs');
  favoriteTabs.addEventListener('click', handleFavoriteAndBookmarkClick);
}

function handleFavoriteAndBookmarkClick(event) {
  if (event.target.tagName.toLowerCase() === 'span') {
    const folderPath = event.target.dataset.path;
    if (folderPath) {
      renderFolderTreeForFavoriteAndBookmark(folderPath);
    }
  }
}

async function renderFolderTreeForFavoriteAndBookmark(folderPath) {
  showLoading();
  try {
    const structure = await invoke('read_directory_async', { folderPath });
    if (structure && structure.length > 0) {
      // Sort the structure array using natural sorting
      structure.sort(naturalCompare);
      renderTree(document.getElementById('folderTree'), structure);
    } else {
      showCustomAlert('Folder not found or it is empty.');
    }
  } catch (error) {
    showCustomAlert(`Error reading directory: ${error.message || error}`);
  } finally {
    hideLoading();
  }
}

async function loadFavoritesLocally() {
  const favorites = localStorage.getItem('favorites');
  return favorites ? JSON.parse(favorites) : [];
}

function saveFavoritesLocally() {
  localStorage.setItem('favorites', JSON.stringify(favorites));
}

let searchHandle = null;

async function cancelSearch() {
  await invoke('cancel_search');
  searchHandle = null;

  // Clear previous search results if the search input is empty
  const dropdown = document.getElementById('searchResultsDropdown');
  dropdown.innerHTML = ''; // Clear the dropdown
  dropdown.style.display = 'none'; // Hide the dropdown
  document.getElementById('searchInput').disabled = false;
  document.getElementById('searchButton').style.display = 'block';
  document.getElementById('cancelButton').style.display = 'none';
}

async function performSearch() {
  let searchTerm = document.getElementById('searchInput').value.trim();

  // Cancel previous search if any
  if (searchHandle) {
    cancelSearch();
  }

  if (searchTerm === '') {
    return;
  }

  try {
    document.getElementById('searchInput').disabled = true;
    document.getElementById('searchButton').style.display = 'none';
    document.getElementById('cancelButton').style.display = 'block';

    const folderPath = "\\\\172.16.10.81\\Resource_RNDS"; // Default path, or you can get it dynamically
    searchHandle = await invoke('search_directory', { folderPath, searchTerm });
  } catch (error) {
    console.error('Error searching directory:', error);

    // Show the error message to the user
    showCustomAlert(`Error: ${error.message || error}`);
  } finally {
    document.getElementById('searchInput').disabled = false;
    document.getElementById('searchButton').style.display = 'block';
    document.getElementById('cancelButton').style.display = 'none';
  }
}

function appendSearchResult(result) {
  const dropdown = document.getElementById('searchResultsDropdown');
  const option = document.createElement('div');
  option.classList.add('search-result-item');
  option.textContent = result.name + (result.is_directory ? ' [Folder]' : ' [File]') + " (" + result.path + ")";
  option.dataset.path = result.path;
  option.addEventListener('click', () => {
    handleSearchResultClick(result);
  });
  dropdown.appendChild(option);

  // Ensure dropdown is visible
  dropdown.style.display = 'block';
}

function handleSearchResultClick(result) {
  const dropdown = document.getElementById('searchResultsDropdown');
  dropdown.style.display = 'none';
  folderPath = result.path;

  // Re-render the folder tree at the selected path
  renderFolderTree();
  cancelSearch();
}

document.addEventListener('click', (event) => {
  const dropdown = document.getElementById('searchResultsDropdown');
  if (!dropdown.contains(event.target)) {
    dropdown.style.display = 'none';
  }
});

