
export const SHAPES = {
    square: 'square',
    circle: 'circle',
    triangle: 'triangle'
}

export const COLORS = {
    red: '#4B0082',
    green: '#228B22',
    blue: '#DC143C'
}

export const NUMBERS = {
    1: 1,
    2: 2,
    3: 3
}

export const FILLINGS = {
    none: 'none',
    full: 'full',
    dashed: 'dashed'
}

export const propertiesMap = {
    color: Object.values(COLORS),
    shape: Object.values(SHAPES),
    filling: Object.values(FILLINGS),
    number: Object.values(NUMBERS),
};