import 'react-app-polyfill/ie9';
import 'react-app-polyfill/stable';
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import store from './app/store';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Provider } from 'react-redux';
import * as serviceWorker from './serviceWorker';
import {  BrowserRouter as Router, Route } from 'react-router-dom';
import GameCanvasSingleplayer from './features/gameCanvas/GameCanvasSingleplayer';
import LoginModal from './features/loginModal/LoginModal';
import CreateRoomModal from './features/createRoomModal/CreateRoomModal';
import JoinRoomModal from './features/joinRoomModal/JoinRoomModal';
import Room from './features/room/Room';

ReactDOM.render(
    <Provider store={store}>
      <Router>
        <Route path="/" component={App} />
        <Route path="/singleplayer" component={GameCanvasSingleplayer} />
        <Route path="/login" component={LoginModal} />
        <Route path="/createRoom" component={CreateRoomModal} />
        <Route path="/joinRoom" component={JoinRoomModal} />
        <Route path="/room/:id" component={Room} />

      </Router>
    </Provider>,
  document.getElementById('root')
);
    // If you want your app to work offline and load faster, you can change
    // unregister() to register() below. Note this comes with some pitfalls.
    // Learn more about service workers: https://bit.ly/CRA-PWA
    serviceWorker.unregister();
