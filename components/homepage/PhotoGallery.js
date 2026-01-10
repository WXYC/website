import React, { useState } from 'react'
import { IoIosArrowDropright, IoIosArrowDropleft } from 'react-icons/io'
import Image from 'next/image'

import greta from '../../images/greta.jpeg'
import controlRoom from '../../images/controlroom.png'
import cradleEvent from '../../images/cradleevent.jpeg'
import guyInStation from '../../images/guyinstation.jpeg'
import flourescent from '../../images/flourescent.jpeg'
import crowdSunglasses from '../../images/crowdsunglasses.jpeg'
import kickballBench from '../../images/kickballbench.jpeg'

// to add images to gallery:
// (1) put in images directory
// (2) import them above
// (3) add to this images array
const images = [
 flourescent,
  guyInStation,
  greta,
  crowdSunglasses,
  kickballBench,
  controlRoom,
  cradleEvent,
]

export const PhotoGallery = () => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFading, setIsFading] = useState(false)

  const changeImage = (newIndex) => {
    setIsFading(true)

    setTimeout(() => {
      setCurrentIndex(newIndex)
      setIsFading(false)
    }, 200)
  }

  const goToPrevious = () => {
    const newIndex =
      currentIndex === 0 ? images.length - 1 : currentIndex - 1
    changeImage(newIndex)
  }

  const goToNext = () => {
    const newIndex =
      currentIndex === images.length - 1 ? 0 : currentIndex + 1
    changeImage(newIndex)
  }

  return (
    <div className="relative mb-10 w-full">
      {/* Image Container */}
      <div className="relative w-full aspect-[3/2] overflow-hidden rounded-lg">
        <Image
          src={images[currentIndex]}
          alt="Gallery image"
          fill
          priority
          sizes="100vw"
          className={`object-cover transition-opacity duration-300 ease-in-out ${
            isFading ? 'opacity-0' : 'opacity-100'
          }`}
        />
      </div>

      {/* Left Arrow */}
      <button
        onClick={goToPrevious}
        aria-label="Previous image"
        className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white transition hover:bg-black/60"
      >
        <IoIosArrowDropleft size={42} />
      </button>

      {/* Right Arrow */}
      <button
        onClick={goToNext}
        aria-label="Next image"
        className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white transition hover:bg-black/60"
      >
        <IoIosArrowDropright size={42} />
      </button>
    </div>
  )
}

export default PhotoGallery
