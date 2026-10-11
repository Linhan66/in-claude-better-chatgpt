# Flappy Bird

A Flappy Bird clone in plain HTML, CSS and JavaScript. Every graphic (bird, pipes, sky, clouds, city, hills, ground, medals) is drawn on a canvas in code, and the sounds are generated with the Web Audio API, so there are no image or audio files.

Open `index.html` in a browser to play.

## Controls

- Space, Up arrow, click or tap: flap
- P or Esc: pause
- M: mute

## Notes

- Physics runs on a fixed 120 Hz step, so gravity feels the same at any frame rate.
- Each pipe pair gets a random gap height; the ground and background layers scroll with the bird at different speeds for parallax.
- You score one point when the bird passes a pipe's centre line. Your best score is saved in the browser.
