import SocketClient from '../socket-client';
import React, { useState, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import AlertWrap from '../Alert'
import { useHistory } from "react-router-dom";

import { useSelector, useDispatch } from 'react-redux';
import {joinRoomApi} from '../loginModal/loginModalSlice'

export default function JoinRoomModal(props) {
  const history = useHistory();
    const textInput = useRef(null);
    const {show, onClose} = props
    const dispatch = useDispatch();

    const [alert, setAlert]= useState(null)
    const errorMessage = "Name cannot be emtpy"
    
  
    const join = () => {
        const name = textInput.current.value ? textInput.current.value.trim() : null;
        if (name && name.length > 0) {
            // SocketClient.joinRoom(name);
            history.push(`/room/${name}`);
            onClose();
        } else {
                setAlert(<AlertWrap type="danger" message={errorMessage}></AlertWrap>);
        }
       
    };
  
    return (
      <div>
        <Modal show={show} onHide={onClose}>
          <Modal.Header closeButton>
            <Modal.Title>Join Room</Modal.Title>
          </Modal.Header>
          <Modal.Body>
              {alert}
              <h4>Enter room's name or id in order to join </h4>
          <Form>
  <Form.Group controlId="formBasicEmail">
    <Form.Label>Name: </Form.Label>
    <Form.Control type="text" placeholder="Room Id" ref={textInput}/>
    <Form.Text className="text-muted">
      Tip: After joining the room, remember to be nice to the others.
    </Form.Text>
  </Form.Group>
  </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="info" onClick={join}>
              Join
            </Button>
          </Modal.Footer>
        </Modal>
        </div>
    );
  }

  
