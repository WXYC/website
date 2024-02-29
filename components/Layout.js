import Link from 'next/link'
import Head from 'next/head'
import Header from './Header'
// import photo from '../images/10144964.png'

export const Layout = (props) => {
  return (
    <div>
      <Head>
        <title>WXYC</title>
        <meta name="description" content="WXYC's website" />
        {/* <link rel="icon" type="image/png" href="10144964.png"/> */}
        <meta name="apple-itunes-app" content="app-id=353182815" />
        {/* <link rel="icon" href="../public/favicon.ico"/> */}
       </Head>  

      <header className='header'>
        <Header/>
      </header>
     
      <main>{props.children}</main>
    </div>
  )
}
