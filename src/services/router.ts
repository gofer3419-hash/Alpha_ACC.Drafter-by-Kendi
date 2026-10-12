import {Route, Router} from '@vaadin/router';

const router = new Router(document.getElementById('main'));

const routes: Route[] = [
  {path: '/', component: 'home-route'},
  {path: '/teams', component: 'team-shuffle-route'},
  {path: '/lobby', component: 'lobby-route'},
  // :dataset is "wif" or "vanilla" (see types/dataset.ts)
  {path: '/drafter/:dataset', component: 'deck-drafter-route'},
  {path: '/drafter/:dataset/:sessionId', component: 'deck-draft-route'},
  {path: '(.*)', redirect: '/'},
];

router.setRoutes([
  {path: '/', component: 'application-route', children: routes},
]);

export {router};
