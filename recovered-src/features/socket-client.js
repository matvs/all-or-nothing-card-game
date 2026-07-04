import io from 'socket.io-client';
import config from '../config';

class Client {
    static instance;

    // constructor(url = 'http://localhost', port = 8081) {
    constructor() {
        if (!Client.instance) {
            Client.instance = this;  
            this.eventListeners = {};
            this.url = config.apiEndpoint;
        }
        
        return Client.instance;

    }

    connect() {
        if (!Object.isFrozen(this)) {
            this.socket = io(this.url);
            Object.freeze(this);
            const listen = names => {
                for (const name of names) {
                    this.socket.on(name, (data) => {
                        this.fireEvent(name, data);
                    });
                }
            };
            listen(['newPlayerJoined', 'allPlayers', 'remove', 'newPos', 'startGame', 'hasFoundSet', 'startGameCounter', 'removePlayer', 'removeCards']);  
        }

        return this;
      
    }

    createNewPlayer(data) {
        this.socket.emit('createPlayer', data);
    }

    updatePos(data) {
        this.socket.emit('updatePos', data);
    }

    joinGame(data) {
        this.socket.emit('joinGame', data);
    }

    logout() {
        this.socket.emit('logout')
    }

    startGame(data) {
        this.socket.emit('startGame', data)
    }

    hasFoundSet(data) {
        this.socket.emit('hasFoundSet', data)
    }

    madeMistake(data) {
        this.socket.emit('madeMistake', data)
    }
    

    listen(event, handler) {
        if (!(event in this.eventListeners)) {
            this.eventListeners[event] = [];
        }
        // TODO: Fix this hack
        this.eventListeners[event] = [];
        this.eventListeners[event].push(handler)
    }

    unsubscribe(event, handler = null) {
        if (event in this.eventListeners) {
            if (handler) {
                // TODO: find handler and remove it
            } else {
                this.eventListeners[event] = [];
            }
            return true;
        }
        return false;
    }

    fireEvent(event, data) {
        if (event in this.eventListeners) {
            for(let handler of this.eventListeners[event]) {
                handler(data);
            }
        }
    }

}



const instance = new Client();


export default instance;
