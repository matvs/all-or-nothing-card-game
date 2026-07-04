const dev = {
    apiEndpoint: 'http://localhost:8081/'
} 

const prod = {
    apiEndpoint: 'https://api.boardgames.matvs.dev/'
} 

 
export default (process.env.NODE_ENV === 'production' ? prod : dev);