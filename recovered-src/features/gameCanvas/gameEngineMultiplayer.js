import GameEngineAbstract from './gameEngineAbstract';
export default class GameEngineMultiplayer extends GameEngineAbstract {
    constructor(canvas) {
        super(canvas)
    }

    run() {
        super.run();

    }

    init(data) {
        const indexes = data.shuffledCards;;
        for (let i = 0; i < this.cards.length; ++i) {
            let index = indexes[i];
            let temp = this.cards[i];
            this.cards[i] = this.cards[index];
            this.cards[index] = temp;
        }

        this.allSets = [];
        this.foundSets = [];
        this.set = [];
        this.findAllSets();
        this.fireEvent('numberOfSets', this.allSets.length);  
        super.draw();
    }

    update(removeIndexes) {
        // Fix due to gameEngingeAbstract:146   onMouseDown this.set.forEach(card => card.unPick())
        // But it actually makes sense
        this.set = [];
        let i = 12;
        for (const index of removeIndexes) {
            this.cards[index] = this.cards[i];
            this.cards[index].index = index;
            this.cards.splice(i++, 1);
        }

        this.allSets = [];
        this.findAllSets();
        this.fireEvent('numberOfSets', this.allSets.length);  
        super.draw();
    }
}
