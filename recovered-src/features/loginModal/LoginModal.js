import SocketClient from '../socket-client';
import React, { useState, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import AlertWrap from '../Alert'
import { useHistory } from "react-router-dom";
import { useDispatch } from 'react-redux';
import {loginApi} from './loginModalSlice';


export default function LoginModal(props) {
    const textInput = useRef(null);
    const dispatch = useDispatch();

    const {show, onClose} = props

    const [alert, setAlert]= useState(null)
    const errorMessage = "Name cannot be emtpy and has to contain at least 3 characters and not more than 12."
    
    const forbiddenNames = ['kurwa', 'dick', 'fuck', 'Cyril'];
  
    const login = () => {
        const name = textInput.current.value ? textInput.current.value.trim() : null;
        if (name && name.length >= 3 && name.length <= 12 && forbiddenNames.indexOf(name) === -1) {
            dispatch(loginApi({name}));
            onClose();
        } else {
            if (forbiddenNames.indexOf(name) === -1) {
                setAlert(<AlertWrap type="danger" message={errorMessage}></AlertWrap>);
            }  else {
                setAlert(<AlertWrap type="danger" message={`Name ${name} is forbidden.`}></AlertWrap>);
            }
        
        }
       
    };

    const test = () => {
      SocketClient.connect();
      SocketClient.createNewPlayer({name: 'elo'});
    }
  
    return (
      <div>
        <Modal show={show} onHide={onClose}>
          <Modal.Header closeButton>
            <Modal.Title>Login</Modal.Title>
          </Modal.Header>
          <Modal.Body>
              {alert}
              <h4>In order to play, please introduce yourself</h4>
          <Form>
  <Form.Group controlId="formBasicEmail">
    <Form.Label>Name: </Form.Label>
    <Form.Control type="text" placeholder="Neo" ref={textInput}/>
    <Form.Text className="text-muted">
      Tip: After joining the room, remember to be nice to the others.
    </Form.Text>
  </Form.Group>
  </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="primary" onClick={login}>
              Login
            </Button>
          </Modal.Footer>
        </Modal>
        </div>
    );
  }

  
