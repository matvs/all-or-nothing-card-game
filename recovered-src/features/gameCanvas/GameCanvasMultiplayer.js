import SocketClient from '../socket-client';
import React, { useState, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import GameEngineMultiplayer from './gameEngineMultiplayer';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Alert from 'react-bootstrap/Alert';
import AlertWrap from '../Alert';
import Card from 'react-bootstrap/Card';
import ProgressBar from 'react-bootstrap/ProgressBar'
import Badge from 'react-bootstrap/Badge'
import Table from 'react-bootstrap/Table'
import propertiesMap from './cardProps';

let removeAlertTimeoutId = null;
export default class GameCanvasMultiplayer extends React.Component{
  playersColors = [ '#fe4a49', '#2ab7ca', '#f6cd61', '#7bc043', '#03396c']
  state = {
    alert: null,
    foundSets: [],
    numberOfSets: 0,
    numberOfFoundSets: 0,
    showWinnerModal: false,
    showExplantionModal: false,
    explanation: null,
    showCounterModal: false,
    counter: null,

    
  }

constructor(props) {
  super(props);
  this.canvas = React.createRef();
  // this.alreadyFoundSetsContainer = React.createRef();
}
componentDidMount() {
  this.canvas.current.addEventListener('mousedown', () => {
    if (this.state.alert !== null) {
      this.setState({
        alert: null
      })
    }
  });
  this.gameEngine = new GameEngineMultiplayer(this.canvas.current);
  this.gameEngine.listen('numberOfSets', (number) => {
    this.setState({
    numberOfSets:  number
    })
  });

  this.gameEngine.listen('setAlreadyFound', (number) => {
    this.setState({
    alert:  <AlertWrap type="warning">Set already found</AlertWrap>
    })
  });

  
  this.gameEngine.listen('setFound', (data) => {
    console.log('react setFound', data)
    const {roomId} = this.props;
    SocketClient.hasFoundSet({roomId, indexes: data.indexes});
    this.setState((state, props) => {
      // const numberOfFoundSets = this.state.numberOfFoundSets + 1;
      // let showWinnerModal = false
      // if (numberOfFoundSets === this.state.numberOfSets) {
      //   showWinnerModal = true;
      // }
      // clearTimeout(removeAlertTimeoutId);
      // removeAlertTimeoutId = setTimeout(() => {
      //   this.setState({
      //     alert: null
      //     })
      // }, 2000)
      return {
        alert:  <AlertWrap type="success">Congrats! You have found a set</AlertWrap>,
        foundSets: this.state.foundSets.concat([data]),
        // numberOfFoundSets: numberOfFoundSets,
        // showWinnerModal: showWinnerModal
      }
     

    });
  
  });

   
  this.gameEngine.listen('notASet', (data) => {
    const {roomId} = this.props;
    SocketClient.madeMistake({roomId});

    const showModal = () => {
      this.setState({
        explanation: data,
        showExplantionModal: true,
      })
    }

    this.setState({
    alert:  <AlertWrap type="danger">You lose a point, it is not a set <Alert.Link onClick={() => showModal()}>see why.</Alert.Link></AlertWrap>
    })
  });
  
  this.gameEngine.run();

  SocketClient.listen('startGameCounter', data => {
    const { time } = data;
    let counter = time/1000;
    this.setState({
      counter: counter,
    })

    this.timerIntervalId = setInterval(() => {
    if (--counter < 0) {
      clearInterval(this.timerIntervalId);
      this.setState({
        counter: null,
      })
    } else {
      this.setState({
        counter: counter,
      })
    }

  }, 1000)
  }); 

  SocketClient.listen('startGame', data => {
    if (!data.error) {
       this.gameEngine.init(data.gameData);
       clearInterval(this.timerIntervalId );
       this.setState({
         counter: null,
         showCounterModal: false,
       })
    } else {
      this.setState({
        alert:  <AlertWrap type="warning">Not everyone started game</AlertWrap>,
        counter: null,
        showCounterModal: false,
        })
   }
  })

  SocketClient.listen('removeCards', ({indexes}) => {
    this.gameEngine.update(indexes);
  })


  /*document.documentElement.scrollTop
3125
document.body.scrollHeight
3602
window.innerHeight
477
3602 - 3125
477*/

  const scrollHeight = document.body.scrollHeight;
  const windowHeight = window.innerHeight;
  const step = 10;
  let lastY = 0;
  const scrollToBottom = () => {
    const newY = document.documentElement.scrollTop + step;
    window.scrollTo(0,newY);
    if (!(scrollHeight - newY <= windowHeight) &&  (newY + step) >= lastY) {
      lastY = newY;
      requestAnimationFrame(scrollToBottom);
    }
  };
  // scrollToBottom();
  // window.scrollTo(0,document.body.scrollHeight);
}


closeWinnerModal() {
  this.setState({
    showWinnerModal: false,
  })
}

closeExplantionModal() {
  this.setState({
    showExplantionModal: false,
  })
}

closeCounterModal() {
  this.setState({
    showCounterModal: false,
  })
}

playAgain() {
  this.setState({
    alert: null,
    foundSets: [],
    numberOfSets: 0,
    numberOfFoundSets: 0,
    showWinnerModal: false,
    showExplantionModal: false,
    explanation: null,
  })
  this.gameEngine.restart();
}

join(color) {
  console.log(this.props);
  const {roomId} = this.props;
  SocketClient.joinGame({roomId, color});
}

isUserSitted(user, allPlayers) {
  if (user && allPlayers)  {
      if (allPlayers.find(u => u.id === user.id)) {
        return true;
      }
  }
  return false;
}
start() {
  const {roomId} = this.props;
  SocketClient.startGame({roomId});
  this.setState({
    showCounterModal: true,
    counter: 10,
  })
}

findPlayerBy(color) {
  return this.props.allPlayers && this.props.allPlayers.find(p => p.color == color);
}

   render() {
    return (
      <div style={{marginTop:'30px'}} className="gameCanvas">    
         <Container fluid>
    <Row>
      <Col style={{    maxWidth: '735px'}}> 
    { this.isUserSitted(this.props.user, this.props.allPlayers) ? (<Button style={{marginBottom:'15px', marginRight: '15px', float: 'right', cursor: 'inherit'}}  variant="success" onClick={() => this.start()}>Start{this.state.counter ? `:${this.state.counter}`: null}</Button>) : null }
      {this.playersColors.map(color => {
       const player = this.findPlayerBy(color);
        if (!player) {
          return (
            <Button style={{marginBottom:'15px', marginRight: '15px', float: 'left', backgroundColor: color, borderColor: color, cursor: 'inherit'}}  onClick={() => this.join(color)}>Join</Button>
          ) 
        } else {
          return (<span style={{color: color}} className={`playerName ${player.online ? 'online' : 'offline'}`}> {player.name} : {player.points}</span>);
        }
      })}
      <canvas id="canvas" width="700" height="700"   style={{border:'1px solid black'}} ref={this.canvas}>
        Your browser does not support canvas. 
        </canvas>
    
        { this.state.alert ? this.state.alert : <AlertWrap type="info">There are {this.state.numberOfSets} total number of sets</AlertWrap>}

      </Col>
      <Col> 
      {/* <div id="alreadyFoundSets" ref={this.alreadyFoundSetsContainer}></div> */}
      <h2>
    Already <Badge variant="success">found</Badge> sets: 
  </h2>
      {
        this.state.foundSets.map(({urls, explanation}) => { return (
          <Card style={{ width: '350px', marginBottom:'10px', marginRight: '10px', float: 'left' }}>
            <div>
              {urls.map(url => {
                  return (<Card.Img variant="top" src={url} />)
              })}
  

  </div>
  <Card.Body>
    <Card.Title>Explanation</Card.Title>
    <Card.Text>
   <Table striped bordered hover>
                    <thead>
                    <tr>
      <th>Property</th>
      <th>All the same</th>
      <th>All different</th>
    </tr>
    </thead>
    <tbody>
      { Object.keys(explanation).map(key => {
                return (
                  <tr>
                    <td>{key}</td>
                <td>{explanation[key].allSame ? <Badge variant="success">YES</Badge> : <Badge variant="danger">NO</Badge>  }</td>
                <td>{explanation[key].eachDifferent ? <Badge variant="success">YES</Badge> : <Badge variant="danger">NO</Badge>  }</td>
                  </tr>

                );
                })}
      </tbody>

                </Table>
                
          
           
    </Card.Text>
  </Card.Body>
</Card>)
        })
      }
        </Col>
      </Row>
      </Container>

      <Modal show={this.state.showWinnerModal} onHide={() => this.closeWinnerModal()}>
        <Modal.Header>
          <Modal.Title>Congrats! </Modal.Title>
        </Modal.Header>
        <Modal.Body>You have found all sets, you are a winner!</Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => this.closeWinnerModal()}>
            Ok
          </Button>
        </Modal.Footer>
      </Modal>


      <Modal show={this.state.showExplantionModal} onHide={() => this.closeExplantionModal()}>
        <Modal.Header>
          <Modal.Title>Explanation </Modal.Title>
        </Modal.Header>
    <Modal.Body> <Card style={{ width: '100%' }}>
            <div>
              {this.state.explanation && this.state.explanation.urls.map(url => {
                  return (<Card.Img style={{width: '33.3%'}} variant="top" src={url} />)
              })}
  

  </div>
  <Card.Body>
    <Card.Title>Explanation</Card.Title>
    <Card.Text>
   <Table striped bordered hover>
                    <thead>
                    <tr>
      <th>Property</th>
      <th>All the same</th>
      <th>All different</th>
    </tr>
    </thead>
    <tbody>
      { this.state.explanation && Object.keys(this.state.explanation.explanation).map(key => {
                return (
                  <tr>
                    <td>{key}</td>
                <td>{this.state.explanation.explanation[key].allSame ? <Badge variant="success">YES</Badge> : <Badge variant="danger">NO</Badge>  }</td>
                <td>{this.state.explanation.explanation[key].eachDifferent ? <Badge variant="success">YES</Badge> : <Badge variant="danger">NO</Badge>  }</td>
                  </tr>

                );
                })}
      </tbody>

                </Table>
                
          
           
    </Card.Text>
  </Card.Body>
</Card></Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => this.closeExplantionModal()}>
            Ok
          </Button>
        </Modal.Footer>
      </Modal>


      <Modal show={this.state.showCounterModal} onHide={() => this.closeExplantionModal()}>
        <Modal.Header>
          <Modal.Title>Game starting in: {this.state.counter} </Modal.Title>
        </Modal.Header>
    <Modal.Body> (Waiting for other players to press start) </Modal.Body>
        <Modal.Footer>
          {/* <Button variant="primary" onClick={() => this.closeExplantionModal()}>
            Ok
          </Button> */}
        </Modal.Footer>
      </Modal>
      </div>
       
    );
   }
    
  }

  //style="border:1px solid black"