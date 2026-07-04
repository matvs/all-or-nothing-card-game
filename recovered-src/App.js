import React, { useState, useEffect } from 'react';
import logo from './logo.svg';
import { Counter } from './features/counter/Counter';
import styles from './App.css';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Jumbotron from 'react-bootstrap/Jumbotron';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import LoginModal from './features/loginModal/LoginModal';
import SocketClient from './features/socket-client'
import { useHistory } from "react-router-dom";
import AlertWrap from './features/Alert';

import Alert  from 'react-bootstrap/Alert'

import { useSelector, useDispatch } from 'react-redux';
import {
  login,
  logout,
  addPlayers,
  selectUser,
  welcomeApi,
  selectAlert,
  removeAlert,
  joinRoomError,
  newPlayerJoinedSuccess
} from './features/loginModal/loginModalSlice';
import MainPage from './features/mainPage/Mainpage';
import CreateRoomModal from './features/createRoomModal/CreateRoomModal';
import JoinRoomModal from './features/joinRoomModal/JoinRoomModal'

let removeAlertTimeoutId = null;
function App() {
  const history = useHistory();
  // const [userName, setUserName] = useState(useSelector(selectUserName));
  const user = useSelector(selectUser);
  const alert = useSelector(selectAlert);
  const dispatch = useDispatch();
  const getCurrentAlert = (alertData) => {
    if (alertData) {
      clearTimeout(removeAlertTimeoutId);
      if (!(alertData.autoRemove === false)) {
          removeAlertTimeoutId = setTimeout(() => dispatch(removeAlert()), 3000);
      }
      

      switch (alertData.key) {
        case 'loggedIn': {
          return <AlertWrap type="success" autoRemove={alertData.autoRemove}><span>Hello {alertData.userName} You were succesfully logged in. You can now    <Alert.Link onClick={() => {dispatch(removeAlert());showCreateRoomModal(true)}}>create a new room</Alert.Link> or  <Alert.Link onClick={() => {dispatch(removeAlert());showJoinRoomModal(true)}}>join existing one</Alert.Link></span></AlertWrap>
        }
        case 'loggedOut': {
          return <AlertWrap type="warning">You were succesfully logged out</AlertWrap>
        }
        case 'createRoomApiSuccess': {
          return <AlertWrap type="success"><span>Room <b>{alertData.roomId} </b> was succesfully created. You can share now room id with your friends <Alert.Link onClick={() => {history.push(`/room/${alertData.roomId}`)}}>Join now</Alert.Link></span></AlertWrap>;
        }
        case 'createRoomApiError': {
          return <AlertWrap type="danger"><span>Room with id {alertData.roomId} already exists <Alert.Link onClick={() => {dispatch(removeAlert());showCreateRoomModal(true)}}>Try again</Alert.Link></span></AlertWrap>
        }
        case 'joinRoomError': {
          return <AlertWrap type="danger"><span>Room with id {alertData.roomId} does not exist <Alert.Link onClick={() => {dispatch(removeAlert());showJoinRoomModal(true)}}>Try again</Alert.Link></span></AlertWrap>
        }
        case 'joinRoomSuccess': {
          return <AlertWrap type="success">Joined room {alertData.roomId} succesfully</AlertWrap> 
        }
        case 'newPlayerJoined': {
          return <AlertWrap type="success">New Player: {alertData.name} joined</AlertWrap> 
        }
      }
    }

    return null;
  }
  

  
  const [isLoginModalVisible, showLoginModal]= useState(false)
  const [isCreateRoomModalVisible, showCreateRoomModal]= useState(false)
  const [isJoinRoomModalVisible, showJoinRoomModal]= useState(false)

  useEffect(() => {
      if (!user) {
          dispatch(welcomeApi())
      }
  });

  const navigate = (route) => {
    // setAlert(null);
    history.push(route);
  }

 

  // SocketClient.listen('newPlayerJoined', (player) => {
  //   dispatch(addPlayers([player]));
  //   dispatch(newPlayerJoinedSuccess({name: player.name}));
  // });

  // SocketClient.listen('allPlayers', (data) => {
  //   console.log(data);
  //   // if (!data.error) {
  //   //   dispatch(addPlayers(data.players));
  //   //   navigate(`/room/${data.roomId}`);
  //   // } else {
  //   //   dispatch(joinRoomError({id: data.roomId}));
  //   //   // setAlert(<AlertWrap type="danger"><span>Room with id {data.roomId} does not exists <Alert.Link href="/joinrRoom">Try again</Alert.Link></span></AlertWrap>);
  //   // }
  
  // });
  
  return (
    <div className="App mainContent">
      {getCurrentAlert(alert)}
      <MainPage user={user} showLoginModal={showLoginModal} showCreateRoomModal={showCreateRoomModal} showJoinRoomModal={showJoinRoomModal}></MainPage>
      <LoginModal show={isLoginModalVisible} onClose={() => showLoginModal(false)}></LoginModal>
      <CreateRoomModal show={isCreateRoomModalVisible} onClose={() => showCreateRoomModal(false)}></CreateRoomModal>
      <JoinRoomModal show={isJoinRoomModalVisible} onClose={() => showJoinRoomModal(false)}></JoinRoomModal>
    </div>
  );
}

export default App;






