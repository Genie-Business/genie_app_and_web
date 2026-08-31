import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../shared/widgets/genie_scaffold.dart';
import '../../auth/presentation/widgets.dart';
import '../../auth/validators.dart';
import '../events_repository.dart';

const _eventTypes = [
  'Birthday', 'Wedding', 'Anniversary', 'Baby Shower', 'Graduation',
  'Housewarming', 'Naming Ceremony', 'Other',
];

class CreateEventScreen extends ConsumerStatefulWidget {
  const CreateEventScreen({super.key});
  @override
  ConsumerState<CreateEventScreen> createState() => _State();
}

class _State extends ConsumerState<CreateEventScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _address = TextEditingController();
  final _wishlistName = TextEditingController(text: 'Main wishlist');
  String _type = _eventTypes.first;
  DateTime? _date;
  String _recurrence = 'ONE_OFF';
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    _wishlistName.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365 * 3)),
      initialDate: _date ?? now.add(const Duration(days: 14)),
    );
    // Normalise to local noon so a UTC conversion can't roll onto the day before.
    if (d != null) setState(() => _date = DateTime(d.year, d.month, d.day, 12));
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    if (_date == null) {
      setState(() => _error = 'Pick the event date.');
      return;
    }
    setState(() => _loading = true);
    try {
      final event = await ref.read(eventsRepositoryProvider).create(
            type: _type,
            name: _name.text.trim(),
            eventDate: _date!,
            recurrence: _recurrence,
            deliveryAddress: _address.text,
            wishlistName: _wishlistName.text,
          );
      ref.invalidate(eventsListProvider);
      if (mounted) context.pushReplacement('/events/${event.id}');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GenieFormScaffold(
      title: 'New event',
      subtitle: 'Friends will see the event name and date on your shared wishlist.',
      primaryAction: FilledButton(
        onPressed: _loading ? null : _submit,
        child: _loading
            ? const SizedBox(
                height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : const Text('Create event'),
      ),
      children: [
        Form(
          key: _form,
          child: Column(
            children: [
              GenieErrorText(_error),
              GDropdownField(
                label: 'Type',
                value: _type,
                items: _eventTypes,
                onChanged: (v) => setState(() => _type = v ?? _type),
              ),
              GField(
                label: 'Event name',
                controller: _name,
                textCapitalization: TextCapitalization.words,
                validator: (v) => Validators.required(v, 'Event name'),
              ),
              _DateField(
                label: 'Event date',
                value: _date == null ? null : '${formatDate(_date!.toIso8601String())} · ${relativeDay(_date!.toIso8601String())}',
                onTap: _pickDate,
              ),
              const SizedBox(height: 4),
              _RecurrenceField(
                value: _recurrence,
                onChanged: (v) => setState(() => _recurrence = v),
              ),
              const SizedBox(height: 14),
              GField(label: 'Delivery address (optional)', controller: _address),
              GField(label: 'First wishlist name', controller: _wishlistName),
            ],
          ),
        ),
      ],
    );
  }
}

class _RecurrenceField extends StatelessWidget {
  const _RecurrenceField({required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 6),
          child: Text('How often', style: Theme.of(context).textTheme.labelMedium),
        ),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(
              value: 'ONE_OFF',
              label: Text('One-off'),
              icon: Icon(Icons.event_outlined),
            ),
            ButtonSegment(
              value: 'ANNUAL',
              label: Text('Every year'),
              icon: Icon(Icons.autorenew),
            ),
          ],
          selected: {value},
          onSelectionChanged: (s) => onChanged(s.first),
          showSelectedIcon: false,
        ),
        Padding(
          padding: const EdgeInsets.only(left: 4, top: 6),
          child: Text(
            value == 'ANNUAL'
                ? 'Birthdays and anniversaries — the wishlist rolls forward to next year automatically.'
                : 'A single occasion.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onTap});
  final String label;
  final String? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: InkWell(
        onTap: onTap,
        child: InputDecorator(
          decoration: InputDecoration(labelText: label),
          child: Row(
            children: [
              Expanded(child: Text(value ?? 'Select a date')),
              const Icon(Icons.calendar_today_outlined, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}
