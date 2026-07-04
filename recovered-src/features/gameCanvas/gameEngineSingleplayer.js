import GameEngineAbstract from './gameEngineAbstract';
const DEBUG = false;
export default class GameEngineSinglePlayer extends GameEngineAbstract {
    constructor(canvas) {
       super(canvas)
    }


    run() {
        super.run();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);


        this.shuffle();
        super.draw();
        
        this.foundSets = [];
        this.set = [];
        this.findAllSets();
        if (DEBUG) {
            console.log('all sets:\n ', this.allSets.map(set => {
            return set.map(card => {
                let col = Math.floor((card.x+100)/200);
                let row = Math.floor((card.y+130)/150);
                return `row: ${row}, col: ${col}`;
            }).join(';')
      
        }).join('\n'));
        }
     
        this.fireEvent('numberOfSets', this.allSets.length);   
    }

  

    shuffle () {
        let temp;
        for (let i = 0; i < 30000; ++i) {
            let j = Math.floor(Math.random() * Math.floor(this.cards.length));
            let k = Math.floor(Math.random() * Math.floor(this.cards.length));
            temp = this.cards[j];
            this.cards[j] = this.cards[k];
            this.cards[k] = temp;
        }
    }
}
