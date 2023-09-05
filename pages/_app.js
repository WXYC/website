import React from 'react'
import '/styles/globals.css'
import { Layout } from '../components/Layout';
import WidgetForLayout from '../components/WidgetForLayout';


const App = ({ Component, pageProps }) => {

  return (
    <div className='flex flex-col lg:items-center'>
      <div className='flex flex-col bg-black font-poppins text-white text-base w-92 max-w-screen-2xl h-full m-0 overflow-hidden'>
      {/* <WidgetForLayout/> */}
          <Layout>
            <Component {...pageProps} />
          </Layout>
      </div>
    </div>  
    
  );
};

export default App;
