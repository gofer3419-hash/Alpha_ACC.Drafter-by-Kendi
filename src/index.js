import {color} from '@vaadin/vaadin-lumo-styles';

const $tpl1 = document.createElement('template');
$tpl1.innerHTML = `<style>${color.toString().replace(':host', 'html')}</style>`;
document.head.appendChild($tpl1.content);

import '@vaadin/icons';
import './iconset.js';

/** Routes */
import './routes/application';
import './routes/home';
import './routes/team-shuffle';
import './routes/deck-drafter';
import './routes/deck-draft';

import './services/router';

import '../styles/app.css';
