import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../shared/widgets/genie_mark.dart';

/// The genie welcome tour — a full-bleed photo walkthrough that mirrors the
/// marketing showcase (deep violet, Cormorant Garamond display) with a slow
/// Ken-Burns drift on each frame.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _Slide {
  const _Slide({
    required this.line1,
    required this.line2,
    required this.body,
    required this.image,
  });
  final String line1;
  final String line2;
  final String body;
  final String image;
}

const _slides = [
  _Slide(
    line1: 'The gift they',
    line2: 'really wanted',
    body: 'Build a wishlist of real things, from real shops.',
    image: 'assets/onboarding/celebrate.jpg',
  ),
  _Slide(
    line1: 'A little bit of',
    line2: 'magic',
    body: 'Send an anonymous gift — revealed only when it arrives.',
    image: 'assets/onboarding/couple.jpg',
  ),
  _Slide(
    line1: 'One place for',
    line2: 'every celebration',
    body: 'Birthdays, weddings, showers. Friends gift exactly what you asked for.',
    image: 'assets/onboarding/gift.jpg',
  ),
];

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0E0813),
      body: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            onPageChanged: (i) => setState(() => _page = i),
            itemCount: _slides.length,
            itemBuilder: (_, i) => _SlideView(slide: _slides[i]),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(28, 0, 28, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        _slides.length,
                        (i) => AnimatedContainer(
                          duration: const Duration(milliseconds: 250),
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          height: 6,
                          width: i == _page ? 22 : 6,
                          decoration: BoxDecoration(
                            color: i == _page ? Colors.white : Colors.white24,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 22),
                    SizedBox(
                      width: double.infinity,
                      height: 54,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: const Color(0xFF16121F),
                          shape:
                              RoundedRectangleBorder(borderRadius: BorderRadius.circular(27)),
                          textStyle:
                              GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 16.5),
                        ),
                        onPressed: () => context.go('/auth/role'),
                        child: const Text('Get started'),
                      ),
                    ),
                    const SizedBox(height: 4),
                    TextButton(
                      onPressed: () => context.go('/auth/sign-in'),
                      child: Text('I already have an account',
                          style: GoogleFonts.inter(
                              color: Colors.white70, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide});
  final _Slide slide;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        _KenBurns(asset: slide.image),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              stops: [0.0, 0.34, 0.62, 1.0],
              colors: [
                Color(0x140E0813),
                Color(0x660E0813),
                Color(0xE60E0813),
                Color(0xFF0E0813),
              ],
            ),
          ),
        ),
        const Align(
          alignment: Alignment.topCenter,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0, -1.1),
                radius: 1.1,
                colors: [Color(0x386D28D9), Color(0x00000000)],
              ),
            ),
            child: SizedBox(height: 260, width: double.infinity),
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 20, 28, 180),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const GenieMark(size: 24, color: Colors.white),
                    const SizedBox(width: 8),
                    Text('genie',
                        style: GoogleFonts.quicksand(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 22,
                          letterSpacing: -0.5,
                        )),
                  ],
                ),
                const Spacer(),
                Text(
                  slide.line1,
                  style: GoogleFonts.cormorantGaramond(
                    color: Colors.white,
                    fontSize: 52,
                    height: 1.0,
                    fontWeight: FontWeight.w300,
                    shadows: const [Shadow(color: Colors.black38, blurRadius: 12)],
                  ),
                ),
                Text(
                  slide.line2,
                  style: GoogleFonts.cormorantGaramond(
                    color: Colors.white,
                    fontSize: 52,
                    height: 1.05,
                    fontStyle: FontStyle.italic,
                    fontWeight: FontWeight.w400,
                    shadows: const [
                      Shadow(color: Color(0x8CFFFFFF), blurRadius: 14),
                      Shadow(color: Color(0x806D28D9), blurRadius: 32),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  slide.body,
                  style: GoogleFonts.inter(color: Colors.white70, fontSize: 15, height: 1.5),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Slow pan + zoom on a still image, ping-ponging.
class _KenBurns extends StatefulWidget {
  const _KenBurns({required this.asset});
  final String asset;

  @override
  State<_KenBurns> createState() => _KenBurnsState();
}

class _KenBurnsState extends State<_KenBurns> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(seconds: 14))
        ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) {
        final t = Curves.easeInOut.transform(_c.value);
        return Transform.scale(
          scale: 1.08 + 0.12 * t,
          alignment: Alignment(-0.3 + 0.6 * t, -0.2 + 0.3 * t),
          child: child,
        );
      },
      child: Image.asset(widget.asset, fit: BoxFit.cover),
    );
  }
}
