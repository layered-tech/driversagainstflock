export function toggleNearestDrawer(navigation) {
  let currentNavigation = navigation;

  while (currentNavigation) {
    if (typeof currentNavigation.toggleDrawer === "function") {
      currentNavigation.toggleDrawer();
      return;
    }

    if (typeof currentNavigation.openDrawer === "function") {
      currentNavigation.openDrawer();
      return;
    }

    currentNavigation =
      typeof currentNavigation.getParent === "function"
        ? currentNavigation.getParent()
        : null;
  }
}
