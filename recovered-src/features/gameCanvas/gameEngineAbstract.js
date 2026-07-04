
import {SHAPES, COLORS, NUMBERS, FILLINGS} from './cardProps';
import Card from './Card';
export default class GameEngineAbstract {
    properties = {
        color: Object.values(COLORS),
        shape: Object.values(SHAPES),
        filling: Object.values(FILLINGS),
        number: Object.values(NUMBERS),
    };

    cards = [];
    ctx = null;
    canvas = null;

    set = [];
    foundSets = [];

    allSets = [];
    eventListeners = {};

    constructor(canvas) {
        for (let color of this.properties.color) {
            for (let shape of this.properties.shape) {
                for (let filling of this.properties.filling) {
                    for (let number of this.properties.number) {
                        this.cards.push(new Card(color, shape, filling, number));
                    }
                }
            }
        }
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');

        this.onMouseDown = this.onMouseDown.bind(this);
        this.canvas.removeEventListener('mousedown', this.onMouseDown)
        this.canvas.addEventListener("mousedown", this.onMouseDown);
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

    restart() {
        this.run();
    }

    run() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw(size = 12) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        let x = 100
        let y = 130;
        const length = this.cards.length < size ? this.cards.length : size;
        for (let i = 0; i < length; ++i) {
            this.cards[i].index = i;
            this.cards[i].draw(x, y, this.ctx);
            x += 200;
            if (i != 0 && (i + 1) % 3 == 0) {
                x = 100;
                y += 150;
            }
        }
    }

    findAllSets(size = 12) {
        this.allSets = [];
        const sliceOfCards = this.cards.slice(0, size)
        for (let i = 0; i < sliceOfCards.length ; ++i) {
            for (let j = i + 1; j < sliceOfCards.length; ++j) {
                for (let k = j + 1; k < sliceOfCards.length; ++k) {
                    const set = [sliceOfCards[i], sliceOfCards[j], sliceOfCards[k]];
                    if (this.isValid(set)) {
                        this.allSets.push(set)
                    }
                }
            }
        }
    }

    isAlreadyFound(currentSet) {
        for(let set of this.foundSets){
            if(currentSet.every(currentCard => {
                return set.find(card => card.isEqual(currentCard)) !== undefined;
            })){
                return true;
            }
        }
        return false
    }

    getClickedCard (event) {
        event.preventDefault();
        var x = event.x;
        var y = event.y;

        const rect = this.canvas.getBoundingClientRect();
        x -= rect.left;
        y -= rect.top;

        let clickedCard = this.cards.find((card) => {
            return card.active && card.cardBorders && x >= card.cardBorders.x && x <= (card.cardBorders.x + card.cardBorders.w) && y >= card.cardBorders.y && y <= (card.cardBorders.y + card.cardBorders.h)

        })

        return clickedCard;
    }

    onMouseDown (event) {
        const clickedCard = this.getClickedCard(event);

        if (clickedCard) {
            if (clickedCard.picked) {
                this.set.splice(this.set.indexOf(clickedCard), 1)
                clickedCard.unPick();
            }
            else {
                if (this.set.length == 3) {
                    this.set.forEach(card => card.unPick())
                    this.set = [];
                }
                this.set.push(clickedCard);
                clickedCard.pick();
            }

            if (this.set.length == 3) {
                const set = this.set.slice();
                if (this.isValid(set)) {
                    if(this.isAlreadyFound(set)){
                        this.fireEvent('setAlreadyFound');
                    }
                    else {
                        const explanation = this.getExplanation(set); 
                        this.fireEvent('setFound', {urls: set.map(card => card.toImage(this.canvas)), explanation, indexes: set.map(card => card.index) });
                        this.foundSets.push(set);
                        if(this.foundSets.length == this.allSets.length) {
                            this.fireEvent('youHaveWon');
                        }
                    }
                } else {
                    const explanation = this.getExplanation(set); 
                    this.fireEvent('notASet', {urls: set.map(card => card.toImage(this.canvas)), explanation });
                }
            }
        }
    }

    isValid (set) {
        for (let prop of Object.keys(this.properties)) {
            if (!(this.allPropsSame(prop, set) || this.eachPropDifferent(prop, set))) {
                return false;
            }
        }
        return true;
    }

    getExplanation(set) {
        let explanation = {};
        for (let prop of Object.keys(this.properties)) {
            explanation[prop] = {
                allSame: this.allPropsSame(prop, set),
                eachDifferent: this.eachPropDifferent(prop, set)
            }
        }
        return explanation;
    }

    allPropsSame(prop, set) {
        let propValue;
        for (let card of set) {
            if (propValue && propValue != card[prop]) {
                return false;
            }
            propValue = card[prop];
        }
        return true;
    }

    eachPropDifferent (prop, set) {
        let propValues = [];
        for (let card of set) {
            if (propValues.indexOf(card[prop]) != -1) {
                return false;
            }
            propValues.push(card[prop]);
        }
        return true;
    }
}