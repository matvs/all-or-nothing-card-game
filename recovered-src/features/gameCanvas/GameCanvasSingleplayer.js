import SocketClient from '../socket-client';
import React, { useState, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import GameEngineSingleplayer from './gameEngineSingleplayer';
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
export default class GameCanvasSingleplayer extends React.Component{
  state = {
    alert: null,
    foundSets: [],
    numberOfSets: 0,
    numberOfFoundSets: 0,
    showWinnerModal: false,
    showExplantionModal: false,
    explanation: null,
    secondsPlayed: 0,
  }
constructor(props) {
  super(props);
  this.canvas = React.createRef();
}
componentDidMount() {
  this.canvas.current.addEventListener('mousedown', () => {
    if (this.state.alert !== null) {
      this.setState({
        alert: null
      })
    }
  });
  this.gameEngine = new GameEngineSingleplayer(this.canvas.current);
  this.gameEngine.listen('numberOfSets', (number) => {
    console.log('numberOF set listened')
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
    this.setState((state, props) => {
      const numberOfFoundSets = this.state.numberOfFoundSets + 1;
      let showWinnerModal = false
      if (numberOfFoundSets === this.state.numberOfSets) {
        clearInterval(this.timer);
        showWinnerModal = true;
      }
      // clearTimeout(removeAlertTimeoutId);
      // removeAlertTimeoutId = setTimeout(() => {
      //   this.setState({
      //     alert: null
      //     })
      // }, 2000)
      return {
        alert:  <AlertWrap type="success">Congrats! You have found a set</AlertWrap>,
        foundSets: this.state.foundSets.concat([data]),
        numberOfFoundSets: numberOfFoundSets,
        showWinnerModal: showWinnerModal
      }
     

    });
  });

   
  this.gameEngine.listen('notASet', (data) => {
    // clearTimeout(removeAlertTimeoutId);
    // removeAlertTimeoutId = setTimeout(() => {
    //   this.setState({
    //     alert: null
    //     })
    // }, 2000)

    const showModal = () => {
      this.setState({
        explanation: data,
        showExplantionModal: true,
      })
    }

    this.setState({
    alert:  <AlertWrap type="danger">It is not a set, <Alert.Link onClick={() => showModal()}>see why.</Alert.Link></AlertWrap>
    })
  });

  this.restartTimer();
  this.gameEngine.run();

 

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
  this.restartTimer();
  this.gameEngine.restart();
}

restartTimer() {
  clearInterval(this.timer); 
  this.gameStartTime = new Date().getTime();
  this.timer = setInterval(() => {
    const passedSeconds = Math.round((new Date().getTime() - this.gameStartTime)/1000);
    this.setState({secondsPlayed: passedSeconds});
    }, 1000)
}

getTime(passedSeconds) {
  const minutes = Math.floor(passedSeconds/60);
  const seconds = passedSeconds % 60;

  const format = number => number < 10 ? '0' + number : number;

  return `${format(minutes)}:${format(seconds)}`;
}

componentWillUnmount() {
  clearInterval(this.timer); 
}


   render() {
    return (
      <div style={{marginTop:'30px'}} className="gameCanvas">
      

      
         <Container fluid>
    <Row>
      <Col style={{    maxWidth: '735px'}}> 
      <Button style={{marginBottom:'15px', marginBottom: '14px', marginRight: '15px', float: 'left'}} variant="warning" onClick={() => this.playAgain()}>Play again</Button>
      <h4 style={{float:'right', width: '80px'}}>{this.getTime(this.state.secondsPlayed)}</h4>
      <canvas id="canvas" width="700" height="700"   style={{border:'1px solid black'}} ref={this.canvas}>
        Your browser does not support canvas. 
        </canvas>
        <ProgressBar style={{marginBottom:'10px'}}  variant="success" now={this.state.numberOfSets !== 0 ? (this.state.numberOfFoundSets / this.state.numberOfSets)*100 : 0}  label={ this.state.numberOfSets !== 0  ? ` You have found ${this.state.numberOfFoundSets} of  ${this.state.numberOfSets} sets` : ''}/>
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
      </div>
       
    );
   }
    
  }

  //style="border:1px solid black"