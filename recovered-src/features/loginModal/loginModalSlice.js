import { createSlice } from '@reduxjs/toolkit';
import CreateRoomModal from '../createRoomModal/CreateRoomModal';
import SocketClient from '../socket-client'
import config from '../../config'

const key = 'currentPlayer';
export const loginSlice = createSlice({
  name: 'user',
  initialState: {
    user: null,
    sessionId: null,
    rooms: {},
    alert: null,
  },
  reducers: {
    login: (state, action) => {
      // const {userName, sessionId} = action.payload;
      // state.userName = userName;
      // state.sessionId = sessionId;
      state.user = action.payload;
      state.alert = {key: 'loggedIn', userName: action.payload.name, autoRemove: false };
      SocketClient.connect();
      // localStorage.setItem(key, JSON.stringify(action.payload));
    },
    logout: (state, action) => {
      // localStorage.removeItem(key)
      // state.userName = null;
      // state.sessionId = null;
      state.user = null;
      state.alert = {key: 'loggedOut' };
    },
    addPlayers: (state, action) => {
      const {roomId, players} = action.payload;
      state.rooms[roomId] = players;
      // state.allPlayers = [...state.allPlayers, ...action.payload]
    },
    addPlayer: (state, action) => {
      const {roomId, player} = action.payload;
      if (state.rooms[roomId]) {
        const currentPlayerIndex = state.rooms[roomId].findIndex(user => user.id === player.id);
        if (currentPlayerIndex > -1) {
          state.rooms[roomId] = [...state.rooms[roomId].slice(0, currentPlayerIndex), ...[player], ...state.rooms[roomId].slice(currentPlayerIndex + 1)];
        } else {
          state.rooms[roomId] = [...state.rooms[roomId], ...[player]];
        }
      } 
      
      // state.allPlayers = [...state.allPlayers, ...action.payload]
    },

    removePlayer: (state, action) => {
      const { id, roomId } = action.payload;
      if (state.rooms[roomId]) {
        const index = state.rooms[roomId].findIndex(user => user.id === id);
        if (index > -1) {
          state.rooms[roomId] = [...state.rooms[roomId].slice(0, index), ...state.rooms[roomId].slice(index + 1)];
        } 
      }
    },
    removeAlert: (state, action) => {
      state.alert = null;
    },
    createRoomApiError: (state, action) => {
      state.alert = {key: 'createRoomApiError', roomId: action.payload.id, errorCode: action.payload.errorCode, autoRemove: false };
    },
    createRoomApiSuccess: (state, action) => {
      state.alert = {key: 'createRoomApiSuccess', roomId: action.payload.id, autoRemove: false };
    },
    joinRoomError: (state, action) => {
      state.alert = {key: 'joinRoomError', roomId: action.payload.id};
    },
    joinRoomSuccess: (state, action) => {
      state.alert = {key: 'joinRoomSuccess', roomId: action.payload.id};
      state.rooms[action.payload.id] = action.payload.players;
      if (action.payload.playerId) {
        const player = action.payload.players.find(p => p.id == action.payload.playerId);
         SocketClient.connect().joinGame({roomId: action.payload.id, color: player.color})
      }
    },
    newPlayerJoinedSuccess: (state, action) => {
      state.alert = {key: 'newPlayerJoinedSuccess', name: action.payload.name};
    },

  },
});

export const { login, logout, addPlayers, removeAlert, createRoomApiError, createRoomApiSuccess, joinRoomError, newPlayerJoinedSuccess, joinRoomSuccess, addPlayer, removePlayer}  = loginSlice.actions;

// The function below is called a thunk and allows us to perform async logic. It
// can be dispatched like a regular action: `dispatch(incrementAsync(10))`. This
// will call the thunk with the `dispatch` function as the first argument. Async
// code can then be executed and other actions can be dispatched
// export const incrementAsync = amount => dispatch => {
//   setTimeout(() => {
//     dispatch(incrementByAmount(amount));
//   }, 1000);
// };

const endpoint = config.apiEndpoint
export const loginApi = body => dispatch => {
  fetch(endpoint + 'login', {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    mode: 'cors', // no-cors, *cors, same-origin
    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
    credentials: 'include', // include, *same-origin, omit
    headers: {
      'Content-Type': 'application/json'
    },
    redirect: 'follow', // manual, *follow, error
    referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    body: JSON.stringify(body) // body data type must match "Content-Type" header
  }).then(response => response.json()).then(data => {
    console.log(data);
    dispatch(login(data));
});
 

};


export const welcomeApi = body => dispatch => {
  fetch(endpoint +'welcome', {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    mode: 'cors', // no-cors, *cors, same-origin
    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
    credentials: 'include', // include, *same-origin, omit
    headers: {
      'Content-Type': 'application/json'
    },
    redirect: 'follow', // manual, *follow, error
    referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
  }).then(response => response.json()).then(data => {
    if (data.foundSession) {
      dispatch(login(data.player));
    }
  
});

};


export const logoutApi = body => dispatch => {
  fetch(endpoint + 'logout', {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    mode: 'cors', // no-cors, *cors, same-origin
    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
    credentials: 'include', // include, *same-origin, omit
    headers: {
      'Content-Type': 'application/json'
    },
    redirect: 'follow', // manual, *follow, error
    referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
  }).then(response => response.json()).then(data => {
    dispatch(logout());
});
};



export const createRoomApi = body => dispatch => {
  fetch(endpoint + 'createRoom', {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    mode: 'cors', // no-cors, *cors, same-origin
    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
    credentials: 'include', // include, *same-origin, omit
    headers: {
      'Content-Type': 'application/json'
    },
    redirect: 'follow', // manual, *follow, error
    referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    body: JSON.stringify(body) // body data type must match "Content-Type" header
  }).then(response => response.json()).then(data => {
    if (!data.error) {
      dispatch(createRoomApiSuccess(data))
    } else {
      dispatch(createRoomApiError(data))
    }
});
};

export const joinRoomApi = body => dispatch => {
  fetch(endpoint + 'joinRoom', {
    method: 'POST', // *GET, POST, PUT, DELETE, etc.
    mode: 'cors', // no-cors, *cors, same-origin
    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
    credentials: 'include', // include, *same-origin, omit
    headers: {
      'Content-Type': 'application/json'
    },
    redirect: 'follow', // manual, *follow, error
    referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    body: JSON.stringify(body) // body data type must match "Content-Type" header
  }).then(response => response.json()).then(data => {
    if (!data.error) {
      dispatch(joinRoomSuccess(data))
    } else {
      dispatch(joinRoomError(data))
    }
});
};





// The function below is called a selector and allows us to select a value from
// the state. Selectors can also be defined inline where they're used instead of
// in the slice file. For example: `useSelector((state) => state.counter.value)`
export const selectUser = state => state.user.user;
export const selectAlert = state => state.user.alert;
export const selectRoomsPlayers = state => id => state.user.rooms[id];

export default loginSlice.reducer;
