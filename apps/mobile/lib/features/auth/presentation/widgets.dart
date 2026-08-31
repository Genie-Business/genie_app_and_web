import 'package:flutter/material.dart';

class GField extends StatelessWidget {
  const GField({
    super.key,
    required this.label,
    required this.controller,
    this.validator,
    this.keyboardType,
    this.obscure = false,
    this.hint,
    this.textCapitalization = TextCapitalization.none,
  });

  final String label;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final TextInputType? keyboardType;
  final bool obscure;
  final String? hint;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
        controller: controller,
        validator: validator,
        keyboardType: keyboardType,
        obscureText: obscure,
        textCapitalization: textCapitalization,
        decoration: InputDecoration(labelText: label, hintText: hint),
        autovalidateMode: AutovalidateMode.onUserInteraction,
      ),
    );
  }
}

class GDropdownField extends StatelessWidget {
  const GDropdownField({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    this.validator,
    this.enabled = true,
    this.hint,
  });

  final String label;
  final String? value;
  final List<String> items;
  final ValueChanged<String?> onChanged;
  final String? Function(String?)? validator;
  final bool enabled;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: DropdownButtonFormField<String>(
        initialValue: value,
        isExpanded: true,
        onChanged: enabled ? onChanged : null,
        validator: validator,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          enabled: enabled,
        ),
        items: [
          for (final item in items)
            DropdownMenuItem(value: item, child: Text(item, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}

class GPasswordField extends StatefulWidget {
  const GPasswordField({
    super.key,
    required this.label,
    required this.controller,
    this.validator,
  });
  final String label;
  final TextEditingController controller;
  final String? Function(String?)? validator;

  @override
  State<GPasswordField> createState() => _GPasswordFieldState();
}

class _GPasswordFieldState extends State<GPasswordField> {
  bool _hidden = true;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
        controller: widget.controller,
        validator: widget.validator,
        obscureText: _hidden,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        decoration: InputDecoration(
          labelText: widget.label,
          suffixIcon: IconButton(
            icon: Icon(_hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined),
            onPressed: () => setState(() => _hidden = !_hidden),
          ),
        ),
      ),
    );
  }
}
