import React, { useState, useRef } from 'react';
import Alert from 'react-bootstrap/Alert';
import { useSelector, useDispatch } from 'react-redux';
import {
  removeAlert,
} from './loginModal/loginModalSlice';

export default function AlertWrap(props) {
     const {type, message, children, onClose, dismissible} = props;
     const timeOut = props.timeOut ? props.timeOut  : 3000;
     const dispatch = useDispatch();


     const content = message ? message : children;
  
    return (
      <div>
          <Alert  onClose={() => dispatch(removeAlert())} variant={type} dismissible={dismissible}>
          {content}
  </Alert>
        
        </div>
    );
  }
