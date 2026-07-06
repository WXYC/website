/**
 * Cover image with an optional photographer credit.
 *
 * Renders the image inside a <figure>; when a non-empty `credit` is supplied a
 * <figcaption> reading "Photo by {credit}" is shown beneath it. Layout of the
 * wrapper is left to the caller via `figureClassName`, so the same caption
 * treatment works for the centered blog cover and the left-aligned archive
 * cover. Content without a credit renders exactly as a bare image would.
 *
 * @param {Object} props
 * @param {string} props.src - Image source URL.
 * @param {string} [props.credit] - Photographer to credit. Omitted/empty hides the caption.
 * @param {string} [props.alt] - Alt text for the image.
 * @param {string} [props.width] - Image width attribute.
 * @param {string} [props.height] - Image height attribute.
 * @param {string} [props.className] - Classes applied to the <img>.
 * @param {string} [props.figureClassName] - Classes applied to the wrapping <figure>.
 * @param {string} [props.captionClassName] - Classes applied to the <figcaption>.
 */
const CoverImage = ({
	src,
	credit,
	alt = '',
	width,
	height,
	className,
	figureClassName = '',
	captionClassName = 'mt-2 text-sm italic text-neutral-400',
}) => {
	const hasCredit = Boolean(credit && credit.trim())

	return (
		<figure className={figureClassName}>
			<img
				src={src}
				alt={alt}
				width={width}
				height={height}
				className={className}
			/>
			{hasCredit && (
				<figcaption className={captionClassName}>Photo by {credit}</figcaption>
			)}
		</figure>
	)
}

export default CoverImage
