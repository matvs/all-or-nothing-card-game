import SocketClient from '../socket-client';
import React, { useState, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Jumbotron from 'react-bootstrap/Jumbotron';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import AlertWrap from '../Alert'
import { useHistory } from "react-router-dom";
import { useSelector, useDispatch } from 'react-redux';
import {
  login,
  logout,
  addPlayers,
  selectUser,
  welcomeApi,
  logoutApi
} from '../loginModal/loginModalSlice';



export default function MainPage(props) {
  const history = useHistory();
  const {user, showLoginModal, showJoinRoomModal, showCreateRoomModal} = props
  const dispatch = useDispatch();
  const playSinglePlayer = () => {
    const path = '/singleplayer';
    // if (history.location.pathname === path) {
    //   window.location.reload();
    // } else {
      history.push(path);
    // }
    
  }
   const logUserOut = () => {
    dispatch(logoutApi());
    history.push('/');
   };
    return (
      <div>
    <Container fluid>
    <Row>
      <Col>  <Jumbotron>
    <h1>All or Nothing Card Game</h1>
    <p>
      You can play single Player Game and MultiPlayer. 
     
    </p>
    <p>
    <OverlayTrigger trigger="click" placement="right" overlay={popover}>
    <Button variant="info">How to Play</Button>
  </OverlayTrigger>
    </p>
  </Jumbotron></Col>
  
    </Row>
    <Row>
      <Col><Card>
    <Card.Body>
      <Card.Title>SinglePlayer</Card.Title>
      <Card.Text>
        Some quick example text to build on the card title and make up the bulk of
        the card's content.
      </Card.Text>
      <Button variant="success" onClick={playSinglePlayer}>Play</Button>
    </Card.Body>
  </Card></Col>
      <Col><Card>
    <Card.Body>
      <Card.Title>MultiPlayer</Card.Title>
      <Card.Text>
      {user ? (`Hello ${user.name}. Join an existing room or create a new one.`) : ('First you need to log in')}
      </Card.Text>
      {
        user ? 
        (<div><Button variant="success" onClick={() => showJoinRoomModal(true)} > Join</Button>
          <Button variant="primary" onClick={() => showCreateRoomModal(true)} > Create</Button>
          <Button variant="warning" onClick={logUserOut} > Logout</Button>
          </div>) :
  
          (<Button variant="primary" onClick={() => showLoginModal(true)} > Login</Button>)
      }
    
    </Card.Body>
  </Card></Col>
    </Row>
  </Container>
        </div>
    );
  }


  const popover = (
    <Popover id="popover-basic">
      <Popover.Title as="h3">Popover right</Popover.Title>
      <Popover.Content>
        And here's some <strong>amazing</strong> content. It's very engaging.
        right?
      </Popover.Content>
    </Popover>
  );

  
