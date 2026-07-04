import SocketClient from '../socket-client';
import React, { useState, useRef } from 'react';

import GameCanvasMultiplayer from '../gameCanvas/GameCanvasMultiplayer';

import { connect } from 'react-redux';
import {
  login,
  logout,
  selectUser,
  selectRoomsPlayers,
  joinRoomApi,
  addPlayer,
  removePlayer
} from '../loginModal/loginModalSlice';

import hand from '../../icons/hand.svg'
import hand_03396c from '../../icons/hand03396c.svg'
import hand_fe4a49 from '../../icons/handfe4a49.svg'
import hand_2ab7ca from '../../icons/hand2ab7ca.svg'
import hand_f6cd61 from '../../icons/handf6cd61.svg'
import hand_7bc043 from '../../icons/hand7bc043.svg'

const hands = {
  '#fe4a49': hand_fe4a49,
  '#2ab7ca': hand_2ab7ca,
  '#f6cd61': hand_f6cd61,
  '#7bc043': hand_7bc043,
  '#03396c': hand_03396c,
}

class Room extends React.Component {
constructor(props) {
  super(props);
  this.canvas = React.createRef();
  this.container = React.createRef();
  this.updatePos = this.updatePos.bind(this);
  // this.roomId = this.props.match.params.id;
}
componentDidMount() {
  this.props.joinRoom(this.props.match.params.id);
  console.log(this.props)
  console.log(this.state);
  // this.updatePosInterval = setInterval(() => {
    
  // }, 10);
  // this.props.match.params.id

  // const players = this.state.rooms[this.roomId];
  // if (players) {
  //   this.setState({
  //     allPlayers: players
  //   })
  // }

  // this.setState({
  //   allPlayers: this.props.allPlayers,
  // });

  SocketClient.listen('allPlayers', (data) => {
    console.log(data);
    if (!data.error) {
      // this.setState({
      //   allPlayers: data.players
      // })
      // dispatch(addPlayers(data.players));
    } else {
      // dispatch(joinRoomError({id: data.roomId}));
      // setAlert(<AlertWrap type="danger"><span>Room with id {data.roomId} does not exists <Alert.Link href="/joinrRoom">Try again</Alert.Link></span></AlertWrap>);
    }
  
  });

  this.container.current.addEventListener("mousemove", this.updatePos);
  SocketClient.listen('newPos', player => {
    this.props.addPlayer(this.props.match.params.id, player)
  });

  SocketClient.listen('hasFoundSet', ({player, indexes}) => {
    this.props.addPlayer(this.props.match.params.id, player);
    // TODO: Fix bug in socket Facade, so that it can listen in multiple places
    // if (indexes) {

    // }
  });



   SocketClient.listen('newPlayerJoined', (player) => {
     this.props.addPlayer(this.props.match.params.id, player);
  });

  SocketClient.listen('remove', (player) => {
    this.props.addPlayer(this.props.match.params.id, player);
 });

 SocketClient.listen('removePlayer', (id) => {
  this.props.removePlayer(this.props.match.params.id, id);
});
//  SocketClient.listen('startGame', data => {
//    if (!data.error) {
//      alert('startGame')
//       this.gameEngine.init(data.gameData);
//    } else {
//      alert('not everyone clicked start');
//   }
//  })
}

componentDidUpdate(prevProps, prevState, snapshot) {
  if (this.props.match.params.id !== prevProps.match.params.id) {
    this.props.joinRoom(this.props.match.params.id);
  }
}

componentWillUnmount() {
  // clearInterval(this.updatePosInterval);
  this.container.current.removeEventListener('mousemove', this.updatePos)
}

updatePos(event) {
  event.preventDefault();
  const rect = this.container.current.getBoundingClientRect();
  var x = event.x - rect.left;
  var y = event.y - rect.top;
  SocketClient.updatePos({x, y, roomId: this.props.match.params.id});
}

getCurrentUserColor(user, allPlayers) {
  if (allPlayers && user) {
    const gamer = allPlayers.find(p => p.id == user.id);
    if (gamer) {
      return 'c' + gamer.color.substring(1);
    }
  }

  return '';
}

renderPlayersCursors(players) {
  const user = this.props.user;
  if (players) {
    return (
      this.props.allPlayers.map(player => {
        if (user && player.id === user.id) {
          return null;
        }
        return (
          <div style={{zIndex: 99999, position:'relative', backgroundImage: `url(${hands[player.color]})`, top: player.y, left:player.x, width:'40px', height:'40px'}}></div>
        )
      })
    );
  }

  return null
}

   render() {
    return (
      <div className={'room ' + this.getCurrentUserColor(this.props.user, this.props.allPlayers)} ref={this.container}>
        <h3>Room id: {this.props.match.params.id}</h3>
        { this.renderPlayersCursors(this.props.allPlayers)}
        <GameCanvasMultiplayer ref={this.canvas} roomId={this.props.match.params.id} allPlayers={this.props.allPlayers} user={this.props.user}></GameCanvasMultiplayer>
      </div>
    );
   }
    
  }
  // 
  //style="border:1px solid black"

  const mapStateToProps = (state, ownProps) => {
    const {user} = state.user;
    const roomId = ownProps.match.params.id;
    return {
    user,
    allPlayers: selectRoomsPlayers(state)(roomId),
  }};

  
  const mapDispatchToProps = dispatch => ({
      joinRoom: (id) => dispatch(joinRoomApi({roomId: id})),
      addPlayer: (roomId, player) => dispatch(addPlayer({roomId, player})),
      removePlayer: (roomId, id) => dispatch(removePlayer({roomId, id})),
    });


  
  export default connect(
    mapStateToProps,
    mapDispatchToProps
  )(Room);