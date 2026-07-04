import {SHAPES, COLORS, NUMBERS, FILLINGS} from './cardProps';
const virtualCanvas = document.createElement("canvas");
const shapesProps = {
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
};

export default class Card {
    index = null;
    constructor(color, shape, filling, number) {
        this.color = color;
        this.shape = shape;
        this.filling = filling;
        this.number = number;
        this.active = false;
        this.picked = false;
        this.cardBorders = {
    
        }
    }

    draw(x, y, ctx) {
    
        // ctx.lineWidth = 2;
    const marginRight = 47.5;
        const drawSquare = function (x, y, ctx) {
            x -= shapesProps.square.size / 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + shapesProps.square.size)
            ctx.lineTo(x + shapesProps.square.size, y + shapesProps.square.size)
            ctx.lineTo(x + shapesProps.square.size, y)
            ctx.lineTo(x, y)
        }
    
        const drawTriangle = function (x, y, ctx) {
            let h = shapesProps.triangle.size * Math.sqrt(3) * 0.5
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 0.5 * shapesProps.triangle.size, y + h)
            ctx.lineTo(x + 0.5 * shapesProps.triangle.size, y + h)
            ctx.lineTo(x, y)
        }
    
        const drawCircle = function (x, y, ctx) {
            ctx.beginPath();
            ctx.arc(x, y, shapesProps.circle.size, 0, 2 * Math.PI);
        }

        const drawCardBorders = function (ctx, cardBorders) {
            ctx.save();
            ctx.strokeStyle = 'black';
            //debugger
            //ctx.strokeRect(this.cardBorders.x, this.cardBorders.y, this.cardBorders.w, this.cardBorders.h);
            ctx.strokeRect(cardBorders.x, cardBorders.y, cardBorders.w, cardBorders.h);
            ctx.restore();
        }

        this.ctx = ctx;
        this.active = true;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        let xoff, yoff = 0;
        this.x = x;
        this.y = y;

        ctx.save();
        if (this.shape == SHAPES.square) {
            ctx.translate(0, -1 * ((shapesProps.card.height + shapesProps.square.size) / 2 + shapesProps.card.yOffset))
        } else if (this.shape == SHAPES.triangle) {
            let h = shapesProps.triangle.size * Math.sqrt(3) * 0.5
            ctx.translate(0, -1 * ((shapesProps.card.height + h) / 2 + shapesProps.card.yOffset))
        } else if (this.shape == SHAPES.circle) {
            ctx.translate(0, -1 * ((shapesProps.card.height + shapesProps.circle.size * 2) / 2 + shapesProps.card.yOffset - shapesProps.circle.size))
        }

        let xTranslate = shapesProps.card.width / 2 + shapesProps.card.xOffset;
        if (this.number == 1) {
            ctx.translate(xTranslate, 0);
        } else if (this.number == 2) {
            ctx.translate(xTranslate - 25, 0);
        } else {
            ctx.translate(8, 0);
        }
        for (let i = 0; i < this.number; ++i) {
            xoff = i * marginRight;
            //yoff += i *50;
            switch (this.shape) {
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

            switch (this.filling) {
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
                    let color = true;
                    // for(let i = 0; i <= 1; i += color ? 0.01 : 0.3){
                    for (let i = 0; i <= 1; i += 0.009) {
                        gradient.addColorStop(i, color ? this.color : 'white');
                        color = !color;
                    }
                    ctx.fillStyle = gradient
                    ctx.fill();
                    break;
                }
            }
        }
        ctx.restore();

        this.cardBorders = {
            x: x + shapesProps.card.xOffset,
            y: y + shapesProps.card.yOffset,
            w: shapesProps.card.width,
            h: shapesProps.card.height,
        }
        drawCardBorders(ctx, this.cardBorders);

    }

    pick () {
        let ctx = this.ctx;
        this.picked = true;
        ctx.save();
        ctx.strokeStyle = '#02075d';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.cardBorders.x, this.cardBorders.y, this.cardBorders.w, this.cardBorders.h);
        ctx.restore();
    }
    
    unPick () {
        let ctx = this.ctx;
        this.picked = false;

        ctx.lineWidth = 1;
        ctx.clearRect(this.cardBorders.x - 10, this.cardBorders.y - 10, this.cardBorders.w + 50, this.cardBorders.h + 50);
        this.draw(this.x, this.y, ctx);
    }

    isEqual (card) {
        return card && this.color === card.color && this.filling === card.filling && this.shape === card.shape && this.number === card.number
    }

    toImage(sourceCanvas) {
        virtualCanvas.width = shapesProps.card.width;
        virtualCanvas.height = shapesProps.card.height;
        virtualCanvas.getContext("2d").drawImage(sourceCanvas, this.cardBorders.x, this.cardBorders.y, this.cardBorders.w, this.cardBorders.h, 0, 0, this.cardBorders.w, this.cardBorders.h);
        return virtualCanvas.toDataURL();
    }
   


}

// function CardOld(color, shape, filling, number) {
//     var self = this;

//     self.color = color;
//     self.shape = shape;
//     self.filling = filling;
//     self.number = number;
//     self.active = false;
//     self.picked = false;
//     self.cardBorders = {

//     }

//     let shapesProps = {
//         [SHAPES.square]: {
//             size: 40
//         },
//         [SHAPES.circle]: {
//             size: 20
//         },
//         [SHAPES.triangle]: {
//             size: 46.19
//         },
//         card: {
//             width: 150,
//             height: 100,
//             xOffset: -20,
//             yOffset: -50,
//         },
//     }

//     const marginRight = 47.5;
//     self.draw = function (x, y, ctx) {
//         self.ctx = ctx;
//         self.active = true;
//         ctx.fillStyle = self.color;
//         ctx.strokeStyle = self.color;
//         xoff = yoff = 0;
//         self.x = x;
//         self.y = y;
//         /*  ctx.save();
//           ctx.fillStyle = '#ff0000';
//           ctx.beginPath();
//           ctx.arc(x, y, 3, 0, 2 * Math.PI);
//           ctx.fill();
//           ctx.restore();*/

//         ctx.save();
//         if (self.shape == SHAPES.square) {
//             ctx.translate(0, -1 * ((shapesProps.card.height + shapesProps.square.size) / 2 + shapesProps.card.yOffset))
//         } else if (self.shape == SHAPES.triangle) {
//             let h = shapesProps.triangle.size * Math.sqrt(3) * 0.5
//             ctx.translate(0, -1 * ((shapesProps.card.height + h) / 2 + shapesProps.card.yOffset))
//         } else if (self.shape == SHAPES.circle) {
//             ctx.translate(0, -1 * ((shapesProps.card.height + shapesProps.circle.size * 2) / 2 + shapesProps.card.yOffset - shapesProps.circle.size))
//         }

//         let xTranslate = shapesProps.card.width / 2 + shapesProps.card.xOffset;
//         if (self.number == 1) {
//             ctx.translate(xTranslate, 0);
//         } else if (self.number == 2) {
//             ctx.translate(xTranslate - 25, 0);
//         } else {
//             ctx.translate(8, 0);
//         }
//         for (let i = 0; i < self.number; ++i) {
//             xoff = i * marginRight;
//             //yoff += i *50;
//             switch (self.shape) {
//                 case SHAPES.square: {
//                     /*let x = x + xoff;
//                     let y = y + yoff;*/
//                     drawSquare(x + xoff, y + yoff, ctx)
//                     break;
//                 }
//                 case SHAPES.circle: {
//                     drawCircle(x + xoff, y + yoff, ctx)
//                     break;
//                 }
//                 case SHAPES.triangle: {
//                     drawTriangle(x + xoff, y + yoff, ctx)
//                     break;
//                 }
//             }

//             switch (self.filling) {
//                 case FILLINGS.none: {
//                     ctx.stroke();
//                     break;
//                 }
//                 case FILLINGS.full: {
//                     ctx.fill();
//                     break;
//                 }
//                 case FILLINGS.dashed: {
//                     var gradient = ctx.createLinearGradient(x + xoff, y + yoff - 150, x + xoff, y + yoff - 150 + 275);
//                     color = true;
//                     // for(let i = 0; i <= 1; i += color ? 0.01 : 0.3){
//                     for (let i = 0; i <= 1; i += 0.009) {
//                         gradient.addColorStop(i, color ? self.color : 'white');
//                         color = !color;
//                     }
//                     ctx.fillStyle = gradient
//                     ctx.fill();
//                     break;
//                 }
//             }
//         }
//         ctx.restore();

//         self.cardBorders = {
//             x: x + shapesProps.card.xOffset,
//             y: y + shapesProps.card.yOffset,
//             w: shapesProps.card.width,
//             h: shapesProps.card.height,
//         }
//         drawCardBorders(ctx, self.cardBorders);

//     }

//     self.pick = function () {
//         ctx = self.ctx;
//         self.picked = true;
//         ctx.save();
//         ctx.strokeStyle = '#02075d';
//         ctx.lineWidth = 3;
//         ctx.strokeRect(self.cardBorders.x, self.cardBorders.y, self.cardBorders.w, self.cardBorders.h);
//         ctx.restore();
//     }
//     self.unPick = function () {
//         ctx = self.ctx;
//         self.picked = false;

//         ctx.lineWidth = 1;
//         ctx.clearRect(self.cardBorders.x - 10, self.cardBorders.y - 10, self.cardBorders.w + 50, self.cardBorders.h + 50);
//         self.draw(self.x, self.y, ctx);
//     }

//     self.isEqual = function (card) {
//         return card && self.color === card.color && self.filling === card.filling && self.shape === card.shape && self.number === card.number
//     }

//     self.toImage = function() {
//         virtualCanvas.width = shapesProps.card.width;
//         virtualCanvas.height = shapesProps.card.height;
//         virtualCanvas.getContext("2d").drawImage(AllOrNothing.canvas, self.cardBorders.x, self.cardBorders.y, self.cardBorders.w, self.cardBorders.h, 0, 0, self.cardBorders.w, self.cardBorders.h);
//         return virtualCanvas.toDataURL();
//     }
//     drawCardBorders = function (ctx, cardBorders) {
//         ctx.save();
//         ctx.strokeStyle = 'black';
//         //debugger
//         //ctx.strokeRect(self.cardBorders.x, self.cardBorders.y, self.cardBorders.w, self.cardBorders.h);
//         ctx.strokeRect(cardBorders.x, cardBorders.y, cardBorders.w, cardBorders.h);
//         ctx.restore();
//     }

//     drawSquare = function (x, y, ctx) {
//         x -= shapesProps.square.size / 2;
//         ctx.beginPath();
//         ctx.moveTo(x, y);
//         ctx.lineTo(x, y + shapesProps.square.size)
//         ctx.lineTo(x + shapesProps.square.size, y + shapesProps.square.size)
//         ctx.lineTo(x + shapesProps.square.size, y)
//         ctx.lineTo(x, y)
//     }

//     drawTriangle = function (x, y, ctx) {
//         let h = shapesProps.triangle.size * Math.sqrt(3) * 0.5
//         ctx.beginPath();
//         ctx.moveTo(x, y);
//         ctx.lineTo(x - 0.5 * shapesProps.triangle.size, y + h)
//         ctx.lineTo(x + 0.5 * shapesProps.triangle.size, y + h)
//         ctx.lineTo(x, y)
//     }

//     drawCircle = function (x, y, ctx) {
//         ctx.beginPath();
//         ctx.arc(x, y, shapesProps.circle.size, 0, 2 * Math.PI);
//     }

// }