const SHAPES = {
    square: 'square',
    circle: 'circle',
    triangle: 'triangle'
}

const COLORS = {
    red: '#4B0082',
    green: '#228B22',
    blue: '#DC143C'
}

const NUMBERS = {
    1: 1,
    2: 2,
    3: 3
}

const FILLINGS = {
    none: 'none',
    full: 'full',
    dashed: 'dashed'
}

var AllOrNothing = {
    defaultOptions: {
        canvasId: 'canvas'
    },

    properties: {
        color: Object.values(COLORS),
        shape: Object.values(SHAPES),
        filling: Object.values(FILLINGS),
        number: Object.values(NUMBERS),
    },

    cards: [],
    ctx: null,
    canvas: null,

    set: [],
    foundSets: [],

    init: function () {
        for (let color of this.properties.color) {
            for (let shape of this.properties.shape) {
                for (let filling of this.properties.filling) {
                    for (let number of this.properties.number) {
                        this.cards.push(new Card(color, shape, filling, number));
                    }
                }
            }
        }
        this.onMouseDown = this.onMouseDown.bind(this);

        console.log(this.cards)
        return this;
    },
    i: 0,
    start: function () {
        this.canvas = document.getElementById(this.defaultOptions.canvasId);
        this.ctx = this.canvas.getContext('2d');
        //var i = this.i;
        /*setTimeout(() => {
            this.ctx.clearRect(0,0,this.canvas.width, this.canvas.height);
            this.cards[this.i].draw(0,0,this.ctx);
            ++this.i;
        },100)*/
        this.canvas.removeEventListener('mousedown', this.onMouseDown)
        this.canvas.addEventListener("mousedown", this.onMouseDown);
        this.ctx.restore();

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        //this.ctx.scale(0.75, 0.75);
        /*this.cards[this.i].draw(300, 300, this.ctx);
        this.ctx.restore();
        ++this.i;
        y = 0;
        return
        for (let i = 0; i < this.cards.length; ++i) {
            x = (500 * i) % 1024;
            if (i % 2 == 0) {
                y += 300;
            }
            this.cards[i].draw(x, y, this.ctx);
        }
        this.ctx.restore();
        // ++this.i;
*/
        x = 100
        y = 130;
        this.shuffle();
        for (let i = 0; i < 12; ++i) {


            this.cards[i].draw(x, y, this.ctx);
            x += 200;
            if (i != 0 && (i + 1) % 3 == 0) {
                x = 100;
                y += 150;
            }
        }
        this.findAllSets();
        alert('There are ' + this.allSets.length + ' sets')
        console.log('There are ' + this.allSets.length + ' sets')
        console.log(this.allSets)
        this.foundSets = [];
        //this.ctx.restore();
    },

    allSets: [],

    findAllSets() {
        this.allSets = [];
        let counter = 0;
        for (let i = 0; i < 12; ++i) {
            for (let j = i + 1; j < 12; ++j) {
                for (let k = j + 1; k < 12; ++k) {
                    counter++
                    this.set = [];
                    this.set.push(this.cards[i]);
                    this.set.push(this.cards[j]);
                    this.set.push(this.cards[k]);
                    if (this.checkIfSet()) {
                        this.allSets.push(this.set.slice())
                        console.log('set!')
                    }
                    this.set = [];
                }
            }
        }
        console.log("COUNTER: ", counter)
    },

    isAlreadyFound: function(currentSet) {
        for(let set of this.foundSets){
            if(currentSet.every(currentCard => {
                return set.find(card => card.isEqual(currentCard))
            })){
                return true;
            }
        }
        return false
    },

    shuffle: function () {
        let temp;
        for (let i = 0; i < 30000; ++i) {
            let j = Math.floor(Math.random() * Math.floor(this.cards.length));
            let k = Math.floor(Math.random() * Math.floor(this.cards.length));
            temp = this.cards[j];
            this.cards[j] = this.cards[k];
            this.cards[k] = temp;
        }
    },

    onMouseDown: function (event) {
        event.preventDefault();
        var x = event.x;
        var y = event.y;

        var canvas = document.getElementById("canvas");

        x -= canvas.offsetLeft;
        y -= canvas.offsetTop;
        // x*=1.25;
        //y*=1.25;
        let clickedCard = this.cards.find((card) => {
            return card.active && card.cardBorders && x >= card.cardBorders.x && x <= (card.cardBorders.x + card.cardBorders.w) && y >= card.cardBorders.y && y <= (card.cardBorders.y + card.cardBorders.h)

        })
        console.log("x:" + x + " y:" + y);
        if (clickedCard) {
            console.log(clickedCard)
            if (clickedCard.picked) {
                this.set.splice(this.set.indexOf(clickedCard), 1)
                clickedCard.unPick();
            }
            else {
                this.set.push(clickedCard);
                clickedCard.pick();
            }

            if (this.set.length == 3) {
                if (this.checkIfSet()) {
                    if(this.isAlreadyFound(this.set)){
                        alert("Set already found")
                    }
                    else {
                        alert("Brawo, znalazlas set!");
                        this.foundSets.push(this.set);
                        if(this.foundSets.length == this.allSets.length){
                            alert("You found all sets");
                        }
                    }
                 
                } else {
                    alert("To nie jest set :(")
                }

                this.set.forEach(card => card.unPick())
                //setTimeout(() => this.set.forEach(card => card.unPick()),0);
                this.set = [];
            }
        }
        //console.log("x:" + x + " y:" + y);
    },

    checkIfSet: function () {
        for (let prop of Object.keys(this.properties)) {
            if (!(this.allPropsSame(prop) || this.eachPropDifferent(prop))) {
                return false;
            }
        }
        return true;
    },

    allPropsSame: function (prop) {
        let propValue;
        for (let card of this.set) {
            if (propValue && propValue != card[prop]) {
                return false;
            }
            propValue = card[prop];
        }
        return true;
    },

    eachPropDifferent: function (prop) {
        let propValues = [];
        for (let card of this.set) {
            if (propValues.indexOf(card[prop]) != -1) {
                return false;
            }
            propValues.push(card[prop]);
        }
        return true;
    }
}.init();


function Card(color, shape, filling, number) {
    var self = this;

    self.color = color;
    self.shape = shape;
    self.filling = filling;
    self.number = number;
    self.active = false;
    self.picked = false;
    self.cardBorders = {

    }

    let shapesProps = {
        [SHAPES.square]: {
            size: 40
        },
        [SHAPES.circle]: {
            size: 20
        },
        [SHAPES.triangle]: {
            size: 46.19
        },
        card: {
            width: 150,
            height: 100,
            xOffset: -20,
            yOffset: -50,
        },
    }

    const marginRight = 47.5;
    self.draw = function (x, y, ctx) {
        self.ctx = ctx;
        self.active = true;
        ctx.fillStyle = self.color;
        ctx.strokeStyle = self.color;
        xoff = yoff = 0;
        self.x = x;
        self.y = y;
        /*  ctx.save();
          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
          ctx.fill();
          ctx.restore();*/

        ctx.save();
        if (self.shape == SHAPES.square) {
            ctx.translate(0, -1 * ((shapesProps.card.height + shapesProps.square.size) / 2 + shapesProps.card.yOffset))
        } else if (self.shape == SHAPES.triangle) {
            let h = shapesProps.triangle.size * Math.sqrt(3) * 0.5
            ctx.translate(0, -1 * ((shapesProps.card.height + h) / 2 + shapesProps.card.yOffset))
        } else if (self.shape == SHAPES.circle) {
            ctx.translate(0, -1 * ((shapesProps.card.height + shapesProps.circle.size * 2) / 2 + shapesProps.card.yOffset - shapesProps.circle.size))
        }

        let xTranslate = shapesProps.card.width / 2 + shapesProps.card.xOffset;
        if (self.number == 1) {
            ctx.translate(xTranslate, 0);
        } else if (self.number == 2) {
            ctx.translate(xTranslate - 25, 0);
        } else {
            ctx.translate(8, 0);
        }
        for (let i = 0; i < self.number; ++i) {
            xoff = i * marginRight;
            //yoff += i *50;
            switch (self.shape) {
                case SHAPES.square: {
                    /*let x = x + xoff;
                    let y = y + yoff;*/
                    drawSquare(x + xoff, y + yoff, ctx)
                    break;
                }
                case SHAPES.circle: {
                    drawCircle(x + xoff, y + yoff, ctx)
                    break;
                }
                case SHAPES.triangle: {
                    drawTriangle(x + xoff, y + yoff, ctx)
                    break;
                }
            }

            switch (self.filling) {
                case FILLINGS.none: {
                    ctx.stroke();
                    break;
                }
                case FILLINGS.full: {
                    ctx.fill();
                    break;
                }
                case FILLINGS.dashed: {
                    var gradient = ctx.createLinearGradient(x + xoff, y + yoff - 150, x + xoff, y + yoff - 150 + 275);
                    color = true;
                    // for(let i = 0; i <= 1; i += color ? 0.01 : 0.3){
                    for (let i = 0; i <= 1; i += 0.009) {
                        gradient.addColorStop(i, color ? self.color : 'white');
                        color = !color;
                    }
                    ctx.fillStyle = gradient
                    ctx.fill();
                    break;
                }
            }
        }
        ctx.restore();

        self.cardBorders = {
            x: x + shapesProps.card.xOffset,
            y: y + shapesProps.card.yOffset,
            w: shapesProps.card.width,
            h: shapesProps.card.height,
        }
        drawCardBorders(ctx, self.cardBorders);

    }

    self.pick = function () {
        ctx = self.ctx;
        self.picked = true;
        ctx.save();
        ctx.strokeStyle = '#02075d';
        ctx.lineWidth = 3;
        ctx.strokeRect(self.cardBorders.x, self.cardBorders.y, self.cardBorders.w, self.cardBorders.h);
        ctx.restore();
    }
    self.unPick = function () {
        ctx = self.ctx;
        self.picked = false;

        ctx.lineWidth = 1;
        ctx.clearRect(self.cardBorders.x - 10, self.cardBorders.y - 10, self.cardBorders.w + 50, self.cardBorders.h + 50);
        self.draw(self.x, self.y, ctx);
    }

    self.isEqual = function (card) {
        return card && self.color === card.color && self.filling === card.filling && self.shape === card.shape && self.number === card.number
    }
    drawCardBorders = function (ctx, cardBorders) {
        ctx.save();
        ctx.strokeStyle = 'black';
        //debugger
        //ctx.strokeRect(self.cardBorders.x, self.cardBorders.y, self.cardBorders.w, self.cardBorders.h);
        ctx.strokeRect(cardBorders.x, cardBorders.y, cardBorders.w, cardBorders.h);
        ctx.restore();
    }

    drawSquare = function (x, y, ctx) {
        x -= shapesProps.square.size / 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + shapesProps.square.size)
        ctx.lineTo(x + shapesProps.square.size, y + shapesProps.square.size)
        ctx.lineTo(x + shapesProps.square.size, y)
        ctx.lineTo(x, y)
    }

    drawTriangle = function (x, y, ctx) {
        let h = shapesProps.triangle.size * Math.sqrt(3) * 0.5
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 0.5 * shapesProps.triangle.size, y + h)
        ctx.lineTo(x + 0.5 * shapesProps.triangle.size, y + h)
        ctx.lineTo(x, y)
    }

    drawCircle = function (x, y, ctx) {
        ctx.beginPath();
        ctx.arc(x, y, shapesProps.circle.size, 0, 2 * Math.PI);
    }



}