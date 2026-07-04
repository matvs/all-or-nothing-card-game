import { configureStore } from '@reduxjs/toolkit';
import counterReducer from '../features/counter/counterSlice';
import loginReducer from '../features/loginModal/loginModalSlice';

export default configureStore({
  reducer: {
    counter: counterReducer,
    user: loginReducer,
  },
  devTools: true,
});
