window.APP_ASSETS = Object.freeze({
  hero: "assets/hero.jpg",
  discussion: "assets/discussion.jpg",
  passPhone: "assets/pass-phone.jpg",
  revealCover: "assets/reveal-cover.jpg",
  vote: "assets/vote.jpg",
  roles: Object.freeze({
    team: "assets/role-team.jpg",
    traitor: "assets/role-traitor.jpg"
  }),
  winners: Object.freeze({
    team: "assets/win-team.jpg",
    traitor: "assets/win-traitor.jpg"
  }),
  categories: Object.freeze({
    alltag: "assets/category-alltag.jpg",
    essen: "assets/category-essen.jpg",
    geografie: "assets/category-geografie.jpg",
    gemischt: "assets/category-gemischt.jpg"
  }),
  avatars: Object.freeze(Array.from({ length: 8 }, (_, index) => `assets/avatar-${index + 1}.jpg`))
});
