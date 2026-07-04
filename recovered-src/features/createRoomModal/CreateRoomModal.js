import SocketClient from '../socket-client';
import React, { useState, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import AlertWrap from '../Alert'
import { useHistory } from "react-router-dom";
import { useDispatch } from 'react-redux';
import {createRoomApi} from '../loginModal/loginModalSlice';


export default function CreateRoomModal(props) {
    const textInput = useRef(null);
    const history = useHistory();
    const dispatch = useDispatch();
    const {show, onClose} = props

    const [alert, setAlert]= useState(null)
    const errorMessage = "Custom room name has to contain cannot be longer than 20 characters"
    
    const forbiddenNames = ['kurwa', 'dick', 'fuck'];

    const create = () => {
        const name = textInput.current.value ? textInput.current.value.trim() : null;
        if (!name || (name.length <= 20 && forbiddenNames.indexOf(name) === -1)) {
            // SocketClient.createRoom(name);
            dispatch(createRoomApi({roomId: name}));
            onClose()
            // history.goBack();
        } else {
            if (forbiddenNames.indexOf(name) === -1) {
                setAlert(<AlertWrap type="danger" message={errorMessage}></AlertWrap>);
            }  else {
                setAlert(<AlertWrap type="danger" message={`Name ${name} is forbidden.`}></AlertWrap>);
            }
        
        }
       
    };
  
    return (
      <div>
        <Modal show={show} onHide={onClose}>
          <Modal.Header closeButton>
            <Modal.Title>Create Room</Modal.Title>
          </Modal.Header>
          <Modal.Body>
              {alert}
          <Form>
  <Form.Group controlId="formBasicEmail">
    <Form.Label>Name: </Form.Label>
    <Form.Control type="text" placeholder="Zuerich Enge" ref={textInput}/>
    <Form.Text className="text-muted">
      Tip: You can leave room name empty.
    </Form.Text>
  </Form.Group>
  </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="info" onClick={create}>
              Create
            </Button>
          </Modal.Footer>
        </Modal>
        </div>
    );
  }

  
